// Generador de grafos: descarga las calles de una zona desde OpenStreetMap y produce el archivo
// RCO2 que carga el motor. No depende de Node: funciona igual en Node 18+ y en el navegador.

import { construirGrafo, EstadisticasConstruccion, OpcionesConstruccion } from "./construir.js";
import { Caja, cajaDePoligonos, Poligono, poligonoDeCaja, poligonosDeGeoJSON, ZonaGeoJSON } from "./geometria.js";
import { descargarOverpass, OpcionesDescarga, RespuestaOverpass } from "./overpass.js";
import { escribirRCO2, GrafoRCO } from "./rco2.js";

export * from "./construir.js";
export * from "./geometria.js";
export * from "./overpass.js";
export * from "./rco2.js";

export interface OpcionesGenerarGrafo extends OpcionesDescarga, Omit<OpcionesConstruccion, "poligonos"> {
    /** Zona como GeoJSON (Polygon, MultiPolygon, Feature o FeatureCollection). */
    zona?: ZonaGeoJSON;
    /** Zona como rectángulo, si no se da `zona`. */
    caja?: Caja;
    /** Datos ya descargados de Overpass (p. ej. guardados antes): no se descarga nada. */
    datosOSM?: RespuestaOverpass;
}

export interface GrafoGenerado {
    /** Archivo RCO2 listo para guardar o para cargar en el motor. */
    bytes: Uint8Array;
    grafo: GrafoRCO;
    estadisticas: EstadisticasConstruccion;
    /** Datos crudos de Overpass, para guardarlos y poder regenerar sin internet. */
    datosOSM: RespuestaOverpass;
}

/**
 * Genera el grafo vial de una zona.
 *
 * ```ts
 * const { bytes, estadisticas } = await generarGrafo({ zona: geojson });
 * fs.writeFileSync("grafo.bin", bytes);
 * ```
 */
export async function generarGrafo(opciones: OpcionesGenerarGrafo): Promise<GrafoGenerado> {
    let poligonos: Poligono[];
    if (opciones.zona) poligonos = poligonosDeGeoJSON(opciones.zona);
    else if (opciones.caja) poligonos = [poligonoDeCaja(opciones.caja)];
    else throw new Error("Indica la zona del grafo con `zona` (GeoJSON) o `caja`");

    const datosOSM = opciones.datosOSM ?? await descargarOverpass(cajaDePoligonos(poligonos), opciones);
    opciones.alProgresar?.("Construyendo el grafo...");
    const { grafo, estadisticas } = construirGrafo(datosOSM, { ...opciones, poligonos });
    if (estadisticas.nodos === 0) {
        throw new Error("La zona no contiene calles para automóvil en OpenStreetMap");
    }
    return { bytes: escribirRCO2(grafo), grafo, estadisticas, datosOSM };
}
