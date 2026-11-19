// Descarga de calles de OpenStreetMap con la API Overpass. Usa fetch, así que funciona igual en
// Node 18+ y en el navegador.
import { validarCaja } from "./geometria.js";
/** Servidor público principal de Overpass. Hay otros (y se puede montar uno propio). */
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/**
 * Filtro de vías para automóvil: el mismo que usa OSMnx con network_type="drive", más su filtro
 * de acceso por defecto (excluye access=private).
 */
export const FILTRO_VIAS_AUTO = '["highway"]["area"!~"yes"]' +
    '["highway"!~"abandoned|bridleway|bus_guideway|construction|corridor|cycleway|elevator|escalator|footway|no|' +
    'path|pedestrian|planned|platform|proposed|raceway|razed|rest_area|service|services|steps|track"]' +
    '["motor_vehicle"!~"no"]["motorcar"!~"no"]' +
    '["service"!~"alley|driveway|emergency_access|parking|parking_aisle|private"]' +
    '["access"!~"private"]';
/** Consulta Overpass QL de las vías para automóvil dentro de una caja, con sus nodos. */
export function consultaOverpass(caja, timeoutS = 300) {
    const c = [caja.sur, caja.oeste, caja.norte, caja.este].map((x) => x.toFixed(7)).join(",");
    return `[out:json][timeout:${timeoutS}];(way${FILTRO_VIAS_AUTO}(${c}););(._;>;);out body qt;`;
}
/** Divide la caja en mosaicos de lado máximo `lado` grados. */
export function dividirCaja(caja, lado) {
    const filas = Math.max(1, Math.ceil((caja.norte - caja.sur) / lado));
    const columnas = Math.max(1, Math.ceil((caja.este - caja.oeste) / lado));
    const alto = (caja.norte - caja.sur) / filas;
    const ancho = (caja.este - caja.oeste) / columnas;
    const mosaicos = [];
    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            mosaicos.push({
                sur: caja.sur + f * alto,
                norte: f === filas - 1 ? caja.norte : caja.sur + (f + 1) * alto,
                oeste: caja.oeste + c * ancho,
                este: c === columnas - 1 ? caja.este : caja.oeste + (c + 1) * ancho,
            });
        }
    }
    return mosaicos;
}
/**
 * Descarga las vías para automóvil (y sus nodos) dentro de la caja. Las zonas grandes se piden en
 * varios mosaicos y se unen sin duplicados.
 */
export async function descargarOverpass(caja, opciones = {}) {
    validarCaja(caja);
    const mosaicos = dividirCaja(caja, opciones.ladoMosaico ?? 0.5);
    const vistos = new Set();
    const elements = [];
    for (let i = 0; i < mosaicos.length; i++) {
        opciones.alProgresar?.(mosaicos.length > 1
            ? `Descargando calles de OpenStreetMap (parte ${i + 1} de ${mosaicos.length})...`
            : "Descargando calles de OpenStreetMap...");
        const respuesta = await pedir(consultaOverpass(mosaicos[i], opciones.timeoutS ?? 300), opciones);
        for (const el of respuesta.elements ?? []) {
            const clave = `${el.type}/${el.id}`;
            if (!vistos.has(clave)) {
                vistos.add(clave);
                elements.push(el);
            }
        }
    }
    return { elements };
}
const REINTENTABLES = new Set([429, 502, 503, 504]);
async function pedir(consulta, opciones) {
    const hacerFetch = opciones.fetch ?? globalThis.fetch;
    if (!hacerFetch)
        throw new Error("fetch no está disponible: se necesita Node 18+ o un navegador moderno");
    const url = opciones.overpassUrl ?? OVERPASS_URL;
    const reintentos = opciones.reintentos ?? 3;
    const encabezados = { "Content-Type": "application/x-www-form-urlencoded" };
    // Overpass pide identificar al cliente. Solo en Node: en el navegador (o un Worker) el
    // User-Agent no se puede cambiar y agregarlo forzaría una petición CORS previa.
    const enNode = typeof process !== "undefined" && typeof process.versions?.node === "string";
    if (enNode)
        encabezados["User-Agent"] = "ruta-craft-osm (generador de grafos)";
    let ultimoError;
    for (let intento = 0; intento <= reintentos; intento++) {
        if (intento > 0) {
            const espera = Math.min(60000, (opciones.esperaReintentoMs ?? 5000) * 2 ** (intento - 1));
            opciones.alProgresar?.(`Overpass ocupado; reintentando en ${Math.round(espera / 1000)} s ` +
                `(intento ${intento + 1} de ${reintentos + 1})...`);
            await dormir(espera, opciones.signal);
        }
        let r;
        try {
            r = await hacerFetch(url, {
                method: "POST",
                headers: encabezados,
                body: "data=" + encodeURIComponent(consulta),
                signal: opciones.signal,
            });
        }
        catch (e) {
            if (opciones.signal?.aborted)
                throw e;
            ultimoError = e; // Falla de red: se reintenta
            continue;
        }
        if (r.ok) {
            const datos = (await r.json());
            // Overpass responde 200 con un "remark" cuando se le acaba el tiempo o la memoria
            if (datos.remark && /runtime error|timed out|out of memory/i.test(datos.remark)) {
                throw new Error(`Overpass no pudo completar la consulta: ${datos.remark}. ` +
                    "Prueba con una zona más pequeña (opción ladoMosaico) o con otro servidor (overpassUrl).");
            }
            return datos;
        }
        const detalle = (await r.text().catch(() => "")).slice(0, 300);
        ultimoError = new Error(`Overpass respondió ${r.status} ${r.statusText}${detalle ? `: ${detalle}` : ""}`);
        if (!REINTENTABLES.has(r.status))
            break;
    }
    throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError));
}
function dormir(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted)
            return reject(signal.reason ?? new Error("Cancelado"));
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(signal.reason ?? new Error("Cancelado"));
        }, { once: true });
    });
}
