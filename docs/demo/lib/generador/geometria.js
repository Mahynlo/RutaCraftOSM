// Geometría para generar grafos: distancias, zonas (polígonos GeoJSON) y orden espacial de nodos.
/** Radio con el que OSMnx mide las aristas; se conserva para que los grafos sean comparables. */
export const RADIO_TIERRA_OSMNX_M = 6371009;
const RAD = Math.PI / 180;
/** Distancia de gran círculo en metros (fórmula de haversine, como `osmnx.distance.great_circle`). */
export function haversine(lat1, lon1, lat2, lon2, radio = RADIO_TIERRA_OSMNX_M) {
    const dLat = (lat2 - lat1) * RAD;
    const dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * radio * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Extrae los polígonos de un GeoJSON (FeatureCollection, Feature, Polygon o MultiPolygon). */
export function poligonosDeGeoJSON(geo) {
    const salida = [];
    const visitar = (g) => {
        if (!g)
            return;
        switch (g.type) {
            case "FeatureCollection":
                g.features.forEach((f) => visitar(f.geometry));
                break;
            case "Feature":
                visitar(g.geometry);
                break;
            case "GeometryCollection":
                g.geometries.forEach(visitar);
                break;
            case "Polygon":
                salida.push(g.coordinates.map(anillo));
                break;
            case "MultiPolygon":
                g.coordinates.forEach((p) => salida.push(p.map(anillo)));
                break;
            default: break; // Puntos y líneas no delimitan una zona
        }
    };
    visitar(geo);
    const validos = salida.filter((p) => p.length > 0 && p[0].length >= 4);
    if (validos.length === 0) {
        throw new Error("El GeoJSON no contiene ningún Polygon o MultiPolygon válido");
    }
    return validos;
}
function anillo(coords) {
    return coords.map((c) => {
        const [lon, lat] = c;
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            throw new Error(`Coordenada inválida en el GeoJSON: [${c.join(", ")}]`);
        }
        return [lon, lat];
    });
}
/** Caja que contiene todos los polígonos. */
export function cajaDePoligonos(poligonos) {
    const caja = { sur: Infinity, oeste: Infinity, norte: -Infinity, este: -Infinity };
    for (const p of poligonos) {
        for (const [lon, lat] of p[0]) {
            caja.sur = Math.min(caja.sur, lat);
            caja.norte = Math.max(caja.norte, lat);
            caja.oeste = Math.min(caja.oeste, lon);
            caja.este = Math.max(caja.este, lon);
        }
    }
    return caja;
}
/** Polígono rectangular equivalente a una caja. */
export function poligonoDeCaja(c) {
    return [[[c.oeste, c.sur], [c.este, c.sur], [c.este, c.norte], [c.oeste, c.norte], [c.oeste, c.sur]]];
}
export function validarCaja(c) {
    const ok = [c.sur, c.oeste, c.norte, c.este].every(Number.isFinite) &&
        c.sur < c.norte && c.oeste < c.este && Math.abs(c.sur) <= 90 && Math.abs(c.norte) <= 90 &&
        Math.abs(c.oeste) <= 180 && Math.abs(c.este) <= 180;
    if (!ok)
        throw new Error(`Caja inválida: sur=${c.sur}, oeste=${c.oeste}, norte=${c.norte}, este=${c.este}`);
}
/**
 * Prueba rápida de "punto dentro de la zona" para muchos puntos.
 *
 * Los límites municipales tienen miles de vértices y un grafo tiene decenas de miles de nodos, así
 * que probar cada nodo contra cada lado sería lento. Cada anillo reparte sus lados en franjas
 * horizontales y un punto solo se prueba contra los lados de su franja (regla par-impar, así que
 * los huecos y los polígonos que se traslapan se manejan igual que en GeoJSON).
 */
export class IndiceZona {
    constructor(poligonos) {
        this.poligonos = poligonos.map((p) => ({
            contorno: new AnilloIndexado(p[0]),
            huecos: p.slice(1).map((h) => new AnilloIndexado(h)),
        }));
    }
    /** Dentro de algún polígono: dentro de su contorno y fuera de todos sus huecos. */
    contiene(lon, lat) {
        return this.poligonos.some((p) => p.contorno.contiene(lon, lat) && !p.huecos.some((h) => h.contiene(lon, lat)));
    }
}
class AnilloIndexado {
    constructor(anillo) {
        let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
        for (const [lon, lat] of anillo) {
            latMin = Math.min(latMin, lat);
            latMax = Math.max(latMax, lat);
            lonMin = Math.min(lonMin, lon);
            lonMax = Math.max(lonMax, lon);
        }
        this.latMin = latMin;
        this.latMax = latMax;
        this.lonMin = lonMin;
        this.lonMax = lonMax;
        this.numFranjas = Math.max(1, Math.min(4096, Math.ceil(Math.sqrt(anillo.length))));
        this.altoFranja = (latMax - latMin) / this.numFranjas || 1;
        const listas = Array.from({ length: this.numFranjas }, () => []);
        for (let i = 0; i < anillo.length; i++) {
            const [x1, y1] = anillo[i];
            const [x2, y2] = anillo[(i + 1) % anillo.length]; // Cierra el anillo aunque no repita el primer vértice
            if (y1 === y2)
                continue; // Un lado horizontal nunca cruza el rayo horizontal
            const hasta = this.franja(Math.max(y1, y2));
            for (let f = this.franja(Math.min(y1, y2)); f <= hasta; f++)
                listas[f].push(x1, y1, x2, y2);
        }
        this.franjas = listas.map((l) => Float64Array.from(l));
    }
    franja(lat) {
        return Math.min(this.numFranjas - 1, Math.max(0, Math.floor((lat - this.latMin) / this.altoFranja)));
    }
    contiene(lon, lat) {
        if (lat < this.latMin || lat > this.latMax || lon < this.lonMin || lon > this.lonMax)
            return false;
        const lados = this.franjas[this.franja(lat)];
        let dentro = false;
        for (let i = 0; i < lados.length; i += 4) {
            const x1 = lados[i], y1 = lados[i + 1], x2 = lados[i + 2], y2 = lados[i + 3];
            if ((y1 > lat) !== (y2 > lat) && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) {
                dentro = !dentro;
            }
        }
        return dentro;
    }
}
/**
 * Índice en la curva de Hilbert (orden 16) de cada punto, normalizado a la caja que los contiene.
 * Ordenar los nodos por este índice deja juntos en memoria los nodos cercanos en el mapa, lo que
 * hace que A* y Dijkstra fallen menos en la caché del procesador.
 */
export function indicesHilbert(lats, lons) {
    const n = lats.length;
    let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
    for (let i = 0; i < n; i++) {
        latMin = Math.min(latMin, lats[i]);
        latMax = Math.max(latMax, lats[i]);
        lonMin = Math.min(lonMin, lons[i]);
        lonMax = Math.max(lonMax, lons[i]);
    }
    const LADO = 1 << 16;
    const escalaX = (LADO - 1) / ((lonMax - lonMin) || 1);
    const escalaY = (LADO - 1) / ((latMax - latMin) || 1);
    const indices = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        indices[i] = hilbert(Math.round((lons[i] - lonMin) * escalaX), Math.round((lats[i] - latMin) * escalaY), LADO);
    }
    return indices;
}
// Distancia a lo largo de la curva de Hilbert de (x, y) en una cuadrícula lado x lado (potencia de 2)
function hilbert(x, y, lado) {
    let d = 0;
    for (let s = lado / 2; s >= 1; s /= 2) {
        const rx = (x & s) > 0 ? 1 : 0;
        const ry = (y & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) {
            if (rx === 1) {
                x = lado - 1 - x;
                y = lado - 1 - y;
            }
            const t = x;
            x = y;
            y = t;
        }
    }
    return d;
}
