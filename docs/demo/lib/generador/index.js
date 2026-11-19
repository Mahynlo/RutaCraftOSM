// Generador de grafos: descarga las calles de una zona desde OpenStreetMap y produce el archivo
// RCO2 que carga el motor. No depende de Node: funciona igual en Node 18+ y en el navegador.
import { construirGrafo } from "./construir.js";
import { cajaDePoligonos, poligonoDeCaja, poligonosDeGeoJSON } from "./geometria.js";
import { descargarOverpass } from "./overpass.js";
import { escribirRCO2 } from "./rco2.js";
export * from "./construir.js";
export * from "./geometria.js";
export * from "./overpass.js";
export * from "./rco2.js";
/**
 * Genera el grafo vial de una zona.
 *
 * ```ts
 * const { bytes, estadisticas } = await generarGrafo({ zona: geojson });
 * fs.writeFileSync("grafo.bin", bytes);
 * ```
 */
export async function generarGrafo(opciones) {
    let poligonos;
    if (opciones.zona)
        poligonos = poligonosDeGeoJSON(opciones.zona);
    else if (opciones.caja)
        poligonos = [poligonoDeCaja(opciones.caja)];
    else
        throw new Error("Indica la zona del grafo con `zona` (GeoJSON) o `caja`");
    const datosOSM = opciones.datosOSM ?? await descargarOverpass(cajaDePoligonos(poligonos), opciones);
    opciones.alProgresar?.("Construyendo el grafo...");
    const { grafo, estadisticas } = construirGrafo(datosOSM, { ...opciones, poligonos });
    if (estadisticas.nodos === 0) {
        throw new Error("La zona no contiene calles para automóvil en OpenStreetMap");
    }
    return { bytes: escribirRCO2(grafo), grafo, estadisticas, datosOSM };
}
