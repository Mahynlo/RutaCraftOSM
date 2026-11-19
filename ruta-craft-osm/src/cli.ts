#!/usr/bin/env node
// Herramienta de línea de comandos del paquete (reemplaza a los scripts de Python):
//
//   npx ruta-craft-osm generar --geojson zona.geojson --salida grafo.bin [--respetar-sentido]
//   npx ruta-craft-osm generar --caja 28.97,-111.10,29.21,-110.86 --salida grafo.bin
//   npx ruta-craft-osm info grafo.bin
//   npx ruta-craft-osm reordenar entrada.bin salida.bin

import * as fs from "fs";
import * as path from "path";
import {
    Caja, describirGrafo, escribirRCO2, generarGrafo, leerRCO2, OpcionesGenerarGrafo, reordenarGrafo,
    RespuestaOverpass, ZonaGeoJSON,
} from "./generador";

const AYUDA = `ruta-craft-osm: generador de grafos para el motor de rutas

Uso:
  ruta-craft-osm generar (--geojson <zona.geojson> | --caja <sur,oeste,norte,este>) --salida <grafo.bin> [opciones]
  ruta-craft-osm info <grafo.bin>
  ruta-craft-osm reordenar <entrada.bin> <salida.bin>

Opciones de "generar":
  --respetar-sentido      Respeta las calles de un solo sentido (por defecto se ignoran)
  --guardar-osm <archivo> Guarda los datos descargados de OpenStreetMap (JSON) para regenerar sin internet
  --desde-osm <archivo>   Usa datos guardados con --guardar-osm en vez de descargar
  --overpass <url>        Servidor de Overpass (por defecto https://overpass-api.de/api/interpreter)
  --conservar-desconectados  Conserva las calles no conectadas a la red principal
  --sin-ref               No usa la referencia de la vía (p. ej. "MEX 15") como nombre de calle

"reordenar" renumera los nodos de un grafo existente para que el motor sea más rápido
(los grafos nuevos ya salen reordenados).

Los datos de OpenStreetMap están bajo la licencia ODbL: © colaboradores de OpenStreetMap.
`;

class ErrorUso extends Error {}

function leerCaja(texto: string): Caja {
    const v = texto.split(",").map(Number);
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) {
        throw new ErrorUso(`--caja espera sur,oeste,norte,este en grados (recibido: ${texto})`);
    }
    return { sur: v[0], oeste: v[1], norte: v[2], este: v[3] };
}

function leerJSON<T>(ruta: string): T {
    try {
        return JSON.parse(fs.readFileSync(ruta, "utf8")) as T;
    } catch (e: any) {
        throw new ErrorUso(`No se pudo leer ${ruta}: ${e.message}`);
    }
}

function escribir(ruta: string, datos: Uint8Array | string): void {
    fs.mkdirSync(path.dirname(path.resolve(ruta)), { recursive: true });
    fs.writeFileSync(ruta, datos);
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

async function generar(args: string[]): Promise<void> {
    const opciones: OpcionesGenerarGrafo = { alProgresar: (m) => console.log(`⏳ ${m}`) };
    let salida = "";
    let guardarOSM = "";
    for (let i = 0; i < args.length; i++) {
        const valor = () => {
            if (i + 1 >= args.length) throw new ErrorUso(`Falta el valor de ${args[i]}`);
            return args[++i];
        };
        switch (args[i]) {
            case "--geojson": opciones.zona = leerJSON<ZonaGeoJSON>(valor()); break;
            case "--caja": opciones.caja = leerCaja(valor()); break;
            case "--salida": salida = valor(); break;
            case "--respetar-sentido": opciones.respetarSentido = true; break;
            case "--guardar-osm": guardarOSM = valor(); break;
            case "--desde-osm": opciones.datosOSM = leerJSON<RespuestaOverpass>(valor()); break;
            case "--overpass": opciones.overpassUrl = valor(); break;
            case "--conservar-desconectados": opciones.conservarDesconectados = true; break;
            case "--sin-ref": opciones.usarReferenciaComoNombre = false; break;
            default: throw new ErrorUso(`Opción desconocida: ${args[i]}`);
        }
    }
    if (!opciones.zona && !opciones.caja) throw new ErrorUso("Indica la zona con --geojson o --caja");
    if (!salida) throw new ErrorUso("Indica el archivo de salida con --salida");

    const inicio = Date.now();
    const r = await generarGrafo(opciones);
    if (guardarOSM) {
        escribir(guardarOSM, JSON.stringify(r.datosOSM));
        console.log(`💾 Datos de OpenStreetMap guardados en ${guardarOSM}`);
    }
    escribir(salida, r.bytes);
    const e = r.estadisticas;
    console.log(`✅ ${salida}: ${mb(r.bytes.length)} en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    console.log(`   ${e.nodos.toLocaleString("es-MX")} nodos · ${e.aristas.toLocaleString("es-MX")} aristas · ` +
        `${e.nombresDeCalle.toLocaleString("es-MX")} nombres de calle · ${e.vias.toLocaleString("es-MX")} vías`);
    if (e.nodosFueraDeZona || e.nodosDesconectados) {
        console.log(`   Descartados: ${e.nodosFueraDeZona.toLocaleString("es-MX")} nodos fuera de la zona, ` +
            `${e.nodosDesconectados.toLocaleString("es-MX")} desconectados de la red principal`);
    }
    console.log("   Datos © colaboradores de OpenStreetMap (ODbL)");
}

function info(args: string[]): void {
    if (args.length !== 1) throw new ErrorUso("Uso: ruta-craft-osm info <grafo.bin>");
    const datos = fs.readFileSync(args[0]);
    console.log(`${args[0]} (${mb(datos.length)})`);
    console.log(describirGrafo(leerRCO2(datos)));
}

function reordenar(args: string[]): void {
    if (args.length !== 2) throw new ErrorUso("Uso: ruta-craft-osm reordenar <entrada.bin> <salida.bin>");
    const bytes = escribirRCO2(reordenarGrafo(leerRCO2(fs.readFileSync(args[0]))));
    escribir(args[1], bytes);
    console.log(`✅ ${args[1]}: ${mb(bytes.length)}`);
}

export async function main(argv: string[]): Promise<number> {
    const [comando, ...resto] = argv;
    try {
        switch (comando) {
            case "generar": await generar(resto); break;
            case "info": info(resto); break;
            case "reordenar": reordenar(resto); break;
            case undefined: case "-h": case "--help": case "ayuda": console.log(AYUDA); break;
            default: throw new ErrorUso(`Comando desconocido: ${comando}`);
        }
        return 0;
    } catch (e: any) {
        console.error(`❌ ${e?.message ?? e}`);
        if (e instanceof ErrorUso) console.error(`\n${AYUDA}`);
        return e instanceof ErrorUso ? 2 : 1;
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then((codigo) => { process.exitCode = codigo; });
}
