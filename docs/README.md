# 📚 Documentación Técnica de RutaCraftOSM

**RutaCraftOSM** es una librería ligera para generar rutas de múltiples puntos por calles reales, sin conexión, dentro de una zona específica, sin instalar un servidor de ruteo como OSRM. Calcula la ruta más corta en distancia que recorre una lista de paradas, con instrucciones en español, sobre un grafo de OpenStreetMap de la zona que se elija. Un ejemplo de uso es AguaVP, que genera con ella sus rutas de lectura de medidores. Lo que hace, lo que aún no hace y las posibles mejoras están en [1. Arquitectura: propósito y alcance](./1_ARQUITECTURA_Y_MIGRACION.md).

---

## 🗺️ Índice de Contenidos

1. [🏛️ Arquitectura Global y Migración a C++](./1_ARQUITECTURA_Y_MIGRACION.md)
   - Propósito, comparación con un servidor de ruteo, alcance y posibles mejoras.
   - Visión general: preparación de datos (TypeScript), motor (C++) y consumo (Node/Electron y navegador).
   - Motivación y validación de la migración del motor de Python a C++.
   - Tabla de equivalencia funcional 1:1.

2. [🗺️ Generador de Grafos (TypeScript)](./2_GENERADOR_DE_GRAFOS.md)
   - `ruta-craft-osm generar` desde la línea de comandos y `generarGrafo()` desde código (Node o navegador).
   - Descarga de OpenStreetMap con la API Overpass, mismo filtro y mismas reglas que OSMnx.
   - Recorte por zona, componente principal y orden de nodos por la curva de Hilbert.
   - Opción para respetar las calles de un solo sentido.

3. [⚙️ Motor de Rutas en C++ (`RutaCraftOSM_c`)](./3_MOTOR_CPP_RUTACRAFT.md)
   - Arquitectura modular del código C++20.
   - Especificación del formato binario `RCO2` (y compatibilidad con `RCO1`).
   - Búsqueda espacial $O(\log N)$ con KD-Tree.
   - Algoritmo A\* con heurística plana precalculada en memoria contigua.
   - Instrucciones giro a giro agrupadas por calle.
   - Compilación nativa (CMake o `build.bat`) y a WebAssembly (Emscripten).
   - Referencia completa de la CLI, modo servidor (`--serve`) y códigos de error.
   - Optimización del orden de las paradas (exacto y heurístico, matriz en varios hilos).

4. [📦 Integración TypeScript, Electron y Navegador (`ruta-craft-osm`)](./4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
   - Instalación desde GitHub Releases o desde el código.
   - `calcularRuta()` (un proceso por llamada) y motor persistente `crearMotorRutas()`.
   - Optimización del orden de las paradas y errores tipados (`ErrorRutaCraft`).
   - Detección automática de empaquetado Electron (`app.asar.unpacked`).
   - Interfaces y tipos de TypeScript.
   - Navegador: `crearMotorWeb()` (WebAssembly en un Web Worker) y `cargarMotorWasm()`.

5. [⏱️ Rendimiento del Motor C++](./5_RENDIMIENTO.md)
   - Tiempos medidos de carga, KD-Tree, A\* y ruta completa, nativo y WebAssembly (generados con `bench/correr_benchmark.mjs`).
   - Comparación entre una zona rural (Mazatán - Villa Pesqueira) y una ciudad (Hermosillo).
   - Calidad de las instrucciones, ahorro al optimizar el orden e impacto de las calles de un solo sentido.

6. [🗺️ Visualizador y Comparador Web Interactivo](./visualizacion_ruta.html)
   - Herramienta visual basada en Leaflet con las rutas de los escenarios del benchmark (Mazatán y Hermosillo).
   - Comparación superpuesta de la ruta ignorando y respetando los sentidos de las calles.
   - Enlaces directos a un escenario: `visualizacion_ruta.html?escenario=hermosillo-2&modo=compare`.
   - Simulación animada del recorrido con el aviso de cada instrucción.

7. [▶ Demo en el navegador](./demo.html)
   - El motor WebAssembly calcula rutas entre las paradas que marques en el mapa, sin servidor.
   - Genera el grafo de la zona visible desde OpenStreetMap, también en el navegador.

---

## 📁 Mapa de Carpetas del Proyecto

```text
RutaCraftOSM/
├── docs/                       # Documentación técnica completa y sitio web interactivo
│   ├── css/ js/                # Estilos y lógica (docs, visualizador, landing, demo)
│   ├── demo/                   # Copia del build para navegador y del grafo (npm run demo:web)
│   ├── 1_ARQUITECTURA_Y_MIGRACION.md
│   ├── 2_GENERADOR_DE_GRAFOS.md
│   ├── 3_MOTOR_CPP_RUTACRAFT.md
│   ├── 4_INTEGRACION_TYPESCRIPT_ELECTRON.md
│   ├── 5_RENDIMIENTO.md        # Generado por RutaCraftOSM_c/bench/correr_benchmark.mjs
│   ├── benchmark.json          # Datos crudos del benchmark
│   ├── index.html              # Portada y portal de documentación
│   ├── doc.html                # Lector Markdown interactivo
│   ├── visualizacion_ruta.html # Visualizador Leaflet y comparador de rutas
│   ├── demo.html               # Demo del motor WebAssembly
│   └── README.md               # Índice general
│
├── RutaCraftOSM_c/             # Motor de rutas en C++
│   ├── include/                # Cabeceras modulares (motor, kdtree, astar, grafo, etc.)
│   ├── src/main.cpp            # CLI nativa
│   ├── src/wasm.cpp            # Interfaz WebAssembly
│   ├── bench/                  # Benchmark por fases y generador de 5_RENDIMIENTO.md
│   ├── CMakeLists.txt          # Build nativo y WebAssembly
│   └── build.bat               # Script de compilación estática (MinGW)
│
├── ruta-craft-osm/             # Paquete npm (TypeScript)
│   ├── bin/<plataforma>/       # Motor nativo por plataforma (win32-x64, linux-x64, darwin-x64, darwin-arm64)
│   ├── bin/grafos/             # Grafo RCO2 incluido
│   ├── src/index.ts            # Node / Electron (motor nativo)
│   ├── src/web/                # Navegador (motor WebAssembly + Web Worker)
│   ├── src/generador/          # Generador de grafos
│   ├── src/cli.ts              # CLI del paquete (generar, info, reordenar)
│   ├── test/                   # Pruebas (npm test)
│   ├── wasm/                   # Módulo WebAssembly compilado (generado)
│   └── dist/                   # JavaScript compilado: CommonJS (Node) y dist/esm (navegador)
│
├── datos/                      # GeoJSON de ejemplo, ruta de prueba y escenarios del benchmark
├── RutaCraftOSM/               # Versión original en Python (histórica; ver su README)
├── Libretas/                   # Notebooks de Jupyter donde se pensó originalmente el proyecto
├── .github/workflows/ci.yml    # CI: compila y prueba en Windows, Linux, macOS y WebAssembly
└── README.md                   # README principal del repositorio
```
