# 🚗 RutaCraftOSM

**RutaCraftOSM** es una librería ligera para **generar rutas de múltiples puntos** por calles reales, **sin conexión a internet**, dentro de una zona específica.

Su objetivo es que una aplicación pueda calcular rutas en su propia zona de trabajo (un municipio, una ciudad, un conjunto de colonias) **sin instalar ni operar un servidor de ruteo** como OSRM, GraphHopper o Valhalla. No hace falta Docker, base de datos ni procesar el mapa de un país: basta con un archivo de grafo de pocos MB y el motor incluido en el paquete npm.

Usa solo dos lenguajes:

1. **C++20**: el motor de rutas. Se compila como **ejecutable nativo** (Node.js / Electron) y como **WebAssembly** (navegador), con exactamente las mismas respuestas.
2. **TypeScript**: el paquete npm `ruta-craft-osm`, que incluye el **generador de grafos** (descarga las calles de OpenStreetMap de la zona que elijas) y los envoltorios para Node y para el navegador.

**Ejemplo de uso:** AguaVP, un sistema de gestión de agua potable, la usa para generar las rutas de lectura de medidores. El paquete incluye como grafo de ejemplo el de los municipios de Mazatán y Villa Pesqueira (Sonora), y también se probó con la ciudad de Hermosillo.

**[▶ Pruébalo en el navegador](https://mahynlo.github.io/RutaCraftOSM/demo.html)**: el motor WebAssembly calcula las rutas en tu equipo y puede generar el grafo de la zona que estés viendo en el mapa.

![ejemplo navegador](https://github.com/Mahynlo/RutaCraftOSM/blob/main/mapa_ruta_craft.mp4)


---

## 🎯 Alcance

### Qué hace

Recibe una lista de coordenadas `[lat, lon]` (inicio y paradas) y devuelve:

- **La ruta más corta en distancia** por la red de calles para visitarlas en el orden dado, como polilínea de coordenadas.
- **La distancia total** en metros y kilómetros.
- **Instrucciones en español**, una por calle: *"Sigue recto"*, *"Gira a la derecha en Calle Morelos"*, con la distancia de cada tramo.
- **Opcionalmente, un mejor orden de visita**: reordena las paradas para recorrer menos distancia. Puede volver al inicio o mantener una parada final.

Funciona con el grafo de cualquier zona que se genere con `ruta-craft-osm generar`, siempre que sea de un tamaño manejable: se probó desde zonas rurales de 25 mil nodos hasta una ciudad de 75 mil.

### Qué no hace todavía

La versión actual es intencionalmente simple. Estas son sus limitaciones; varias son mejoras posibles a futuro:

- **Distancia, no tiempo.** Minimiza metros. Aún no usa velocidades, tipos de vía ni tráfico, y no estima tiempos de llegada.
- **Sentidos de las calles.** El grafo de ejemplo los ignora, así que una ruta puede ir en contrasentido. El motor ya acepta grafos que los respetan (`ruta-craft-osm generar --respetar-sentido`).
- **Sin restricciones de giro** (giros prohibidos, etc.).
- **Solo automóvil.** No hay perfiles de peatón ni de bicicleta.
- **Paradas al nodo más cercano.** Cada parada se ajusta al cruce o punto de calle más cercano del grafo, no al punto exacto sobre la calle.
- **Una zona por grafo.** Solo hay ruta dentro del grafo cargado. No está pensado para grafos muy grandes, como un estado o un país completo.
- **Sin guía en tiempo real.** Las instrucciones se calculan una vez; no siguen la posición del usuario ni recalculan.
- **Optimización simple del orden:** un vehículo, sin ventanas de horario ni capacidades. Con hasta 9 paradas el orden es el óptimo exacto; con más es una aproximación pensada para decenas de paradas (50 paradas en una ciudad en ~0.1 s).
- **Nombres de calle.** Dependen de OpenStreetMap: las calles sin nombre usan su referencia (p. ej. `MEX 15`) o aparecen como `"desconocida"`.

### Por qué en C++

La primera versión era Python empaquetado con Nuitka: tardaba ~1 s por ruta y pesaba más de 15 MB en DLLs. El ejecutable en C++ da exactamente la misma ruta y distancia. Tarda ~30–60 ms si se lanza una vez por ruta y menos de 1 ms con el grafo ya cargado (motor persistente). Usa unos 8 MB de memoria con el grafo de ejemplo. Compilado a WebAssembly pesa 317 KB y va entre 1.2× y 1.5× más lento que el nativo en las rutas grandes. Las cifras están medidas en [5. Rendimiento](./docs/5_RENDIMIENTO.md).

---

## ⚙️ Funcionalidades

* 🧭 **Rutas multi-parada**: inicio, paradas intermedias y final, en el orden recibido.
* 🔀 **Optimización del orden de las paradas** (opcional): en rutas de prueba con las paradas desordenadas, la distancia baja entre 63% y 74%. La matriz de distancias se calcula en varios hilos.
* 🧾 **Instrucciones agrupadas por calle**: tipos de giro (ligero, normal, brusco, vuelta en U) y sin tramos de menos de 15 m.
* 🗺️ **Generador de grafos en TypeScript**: descarga de OpenStreetMap (API Overpass) la zona de un GeoJSON o un rectángulo, en Node o en el navegador. Da el mismo grafo que el antiguo pipeline de Python con OSMnx.
* 🌐 **WebAssembly**: el mismo motor en el navegador, dentro de un Web Worker, sin servidor.
* 🌲 **Ajuste rápido de cada parada al grafo** con un KD-Tree, y A\* sobre el grafo cargado en arreglos contiguos, con nodos ordenados por la curva de Hilbert.
* 📦 **Grafo en formato binario `RCO2`**: 1.3 MB para una zona de 25 mil nodos, se carga en ~2 ms.
* 💾 **Caché de tramos**: los tramos ya calculados no se recalculan (archivo JSON en Node, exportable en el navegador).
* 🔌 **Pensado para Electron**:
  * Motor persistente (`crearMotorRutas()`) que carga el grafo una sola vez.
  * Funciona dentro de la app empaquetada (`app.asar.unpacked`).
  * Errores con código (`ErrorRutaCraft.codigo`).
* 💻 **Multiplataforma**: binarios para Windows x64, Linux x64 y macOS (Intel y Apple Silicon) más el módulo WebAssembly, compilados y probados en CI.

---

## 📁 Estructura del Repositorio

```bash
RutaCraftOSM/
├── RutaCraftOSM_c/             # ⚙️ Motor de rutas en C++20
│   ├── include/                # Cabeceras (motor, kdtree, astar, grafo, optimizar, ...)
│   ├── src/main.cpp            # CLI nativa (modo clásico y --serve)
│   ├── src/wasm.cpp            # Interfaz WebAssembly
│   ├── bench/                  # Benchmark por fases (genera docs/5_RENDIMIENTO.md)
│   ├── CMakeLists.txt          # Build nativo (MinGW, MSVC, GCC, Clang) y WebAssembly (Emscripten)
│   └── build.bat               # Atajo con g++ (-O3, -static)
│
├── ruta-craft-osm/             # 📦 Paquete npm (TypeScript)
│   ├── src/index.ts            # Node / Electron: motor nativo
│   ├── src/web/                # Navegador: motor WebAssembly y Web Worker
│   ├── src/generador/          # Generador de grafos (Overpass → RCO2)
│   ├── src/cli.ts              # npx ruta-craft-osm generar | info | reordenar
│   ├── bin/<plataforma>/       # Motor nativo por plataforma
│   ├── bin/grafos/             # Grafo RCO2 incluido (Mazatán - Villa Pesqueira)
│   └── test/                   # Pruebas (node --test): motor, generador, WebAssembly, wrapper
│
├── datos/                      # GeoJSON de la zona de ejemplo, ruta de prueba y escenarios del benchmark
├── RutaCraftOSM/               # 🐍 Versión original en Python (histórica, ya no se usa en el build)
├── Libretas/                   # 📓 Notebooks donde se pensó originalmente el proyecto
├── docs/                       # 📚 Documentación, visualizador y demo en el navegador
└── .github/workflows/ci.yml    # 🤖 CI: compila y prueba en Windows, Linux, macOS y WebAssembly
```

---

## 🚀 Inicio Rápido

### 1. Generar el grafo de tu zona
```powershell
cd ruta-craft-osm
npm install
npm run build
npx ruta-craft-osm generar --geojson ../datos/mazatan_villapesqueira.geojson --salida mi_zona.bin
# o un rectángulo: --caja sur,oeste,norte,este
```
Detalles en [2. Generador de grafos](./docs/2_GENERADOR_DE_GRAFOS.md).

### 2. Compilar el motor
```powershell
# Nativo
cmake -S RutaCraftOSM_c -B RutaCraftOSM_c/build -DCMAKE_BUILD_TYPE=Release
cmake --build RutaCraftOSM_c/build --config Release   # genera RutaCraftOSM_c/bin/cli.exe (o bin/cli)

# WebAssembly (requiere Emscripten)
emcmake cmake -S RutaCraftOSM_c -B RutaCraftOSM_c/build-wasm -DCMAKE_BUILD_TYPE=Release
cmake --build RutaCraftOSM_c/build-wasm               # genera ruta-craft-osm/wasm/motor.mjs y motor.wasm
```
En Windows con MinGW también sirve el atajo `RutaCraftOSM_c\build.bat`. Después copia el binario a `ruta-craft-osm/bin/<plataforma>/` (por ejemplo `bin/win32-x64/cli.exe`) para actualizar el paquete npm. La CI genera además un paquete con los binarios de las cuatro plataformas y el módulo WebAssembly (artefacto `ruta-craft-osm-multiplataforma`).

### 3. Usar en Node.js / Electron
```javascript
const { calcularRuta, crearMotorRutas } = require('ruta-craft-osm');

const respuesta = await calcularRuta({
  puntos: [[29.065639, -110.056448], [29.062039, -110.059091], [29.059486, -110.053973]]
});
console.log(`Distancia: ${respuesta.resultado.distancia_total_km} km`);

// En Electron, para varias rutas seguidas: motor persistente (carga el grafo una sola vez)
const motor = crearMotorRutas({ grafo: 'mi_zona.bin', cachePath: path.join(app.getPath('userData'), 'cache_rutas.json') });
const optimizada = await motor.calcular(paradas, { optimizar: true, regresarAlInicio: true });
app.on('before-quit', () => motor.cerrar());
```

### 4. Usar en el navegador
```javascript
import { crearMotorWeb } from 'ruta-craft-osm/web';

const motor = await crearMotorWeb({ grafo: '/grafos/mi_zona.bin' });
const ruta = await motor.calcular(paradas, { optimizar: true });
```

Detalles en la [guía de integración](./docs/4_INTEGRACION_TYPESCRIPT_ELECTRON.md). El paquete tiene su propio [README](./ruta-craft-osm/README.md) y un [CHANGELOG](./ruta-craft-osm/CHANGELOG.md) por versión.

---

## 🧪 Pruebas

```powershell
cd ruta-craft-osm
npm test
```

Una sola suite (`node --test`) cubre el motor nativo (CLI, modo servidor, caché, formatos, exactitud de A\* y del KD-Tree, optimización, errores), el generador de grafos, el motor WebAssembly (paridad byte a byte con el nativo y el Web Worker) y el wrapper de Node. Las pruebas que necesitan el motor nativo o el WebAssembly se omiten con un aviso si no están compilados.

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) compila el motor en Windows, Linux y macOS y el módulo WebAssembly, corre la suite en cada push a `main` y en cada pull request y arma el paquete npm multiplataforma.

### Publicar una versión

1. Actualiza la versión en `ruta-craft-osm/package.json` y en `project(... VERSION ...)` de `RutaCraftOSM_c/CMakeLists.txt`, y agrega su sección `## X.Y.Z` en `ruta-craft-osm/CHANGELOG.md`.
2. Sube una etiqueta: `git tag v0.2.0 && git push origin v0.2.0` (con sufijo, como `v0.3.0-rc.1`, se publica como pre-release).

El workflow [`release.yml`](./.github/workflows/release.yml) verifica que la etiqueta coincida con esas versiones, corre el CI completo y publica en [GitHub Releases](https://github.com/Mahynlo/RutaCraftOSM/releases) el CLI de cada plataforma (con el grafo de ejemplo), el paquete npm (`.tgz`), el módulo WebAssembly y sus sumas SHA-256. Si el repositorio tiene el secreto `NPM_TOKEN`, también publica el paquete en npm.

### Benchmark

```powershell
cmake --build RutaCraftOSM_c/build --config Release --target cli benchmark
node RutaCraftOSM_c/bench/correr_benchmark.mjs
```

Regenera [`docs/5_RENDIMIENTO.md`](./docs/5_RENDIMIENTO.md), `docs/benchmark.json` y las rutas del [visualizador](./docs/visualizacion_ruta.html). Los grafos de Hermosillo se generan antes con los comandos del encabezado de `correr_benchmark.mjs`.

---

## 📖 Documentación Detallada

Para consultar la guía técnica completa, revisa la carpeta [`docs/`](./docs/README.md):
* [🏛️ Arquitectura Global y Migración a C++](./docs/1_ARQUITECTURA_Y_MIGRACION.md)
* [🗺️ Generador de Grafos (TypeScript)](./docs/2_GENERADOR_DE_GRAFOS.md)
* [⚙️ Motor de Rutas en C++ (`RutaCraftOSM_c`)](./docs/3_MOTOR_CPP_RUTACRAFT.md)
* [📦 Integración TypeScript, Electron y Navegador](./docs/4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
* [⏱️ Rendimiento del Motor C++](./docs/5_RENDIMIENTO.md)
* [🗺️ Visualizador de Rutas del Benchmark](./docs/visualizacion_ruta.html) · [▶ Demo en el navegador](./docs/demo.html)

La primera versión del proyecto, en Python, se conserva como referencia histórica en [`RutaCraftOSM/`](./RutaCraftOSM/README.md), junto con las [libretas](./Libretas/) donde se pensó originalmente.

Los datos de los grafos provienen de OpenStreetMap y están bajo la licencia [ODbL](https://www.openstreetmap.org/copyright) (© colaboradores de OpenStreetMap).
