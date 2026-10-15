# 🚗 RutaCraftOSM (Calculadora de Rutas de Alto Rendimiento con OSM)

**RutaCraftOSM** es un motor de navegación y cálculo de rutas óptimas 100% offline basado en grafos viales de OpenStreetMap (OSM). Integra un pipeline de datos geográficos en Python gestionado con **`uv`**, un **motor de alto rendimiento en C++20** con indexación espacial **KD-Tree** y un **wrapper tipado en TypeScript/npm** listo para aplicaciones de escritorio en **Electron** y **Node.js**.

---

## ⚡ Características Principales

* 🧭 **Multi-paradas**: Soporta origen, múltiples paradas intermedias y destino.
* ⚡ **Ultra Rápido**: Motor nativo en C++20: una ruta multi-parada tarda **< 1 ms** con el motor persistente y **~50 ms** por llamada con `calcularRuta()` en el grafo de producción ([benchmark](./docs/5_RENDIMIENTO.md)).
* 🌲 **Snapping $O(\log N)$ con KD-Tree**: Búsqueda del nodo más cercano instantánea sin evaluar linealmente todo el grafo.
* 📦 **Formato Binario `RCO1`**: Carga un grafo de 25 mil nodos en **~35 ms** y uno urbano de 75 mil (Hermosillo) en **~120 ms**.
* 🧾 **Instrucciones Tipo GPS (*Turn-by-turn*)**: Maniobras de giro (*"Sigue recto"*, *"Gira a la derecha"*), nombres de calles y consolidación de tramos.
* 🔌 **Integración Transparente con Electron**: Motor persistente (`crearMotorRutas()`) y detección automática en entornos de producción empaquetados (`app.asar.unpacked`).
* 🐍 **Gestión Moderna con `uv`**: Extracción y preparación de datos geográficos reproducible y rápida.

---

## 📁 Estructura del Repositorio

```bash
RutaCraftOSM/
├── docs/                       # 📚 Documentación técnica detallada
│   ├── README.md               # Índice general de documentación
│   ├── 1_ARQUITECTURA_Y_MIGRACION.md # Arquitectura y validación de la migración a C++
│   ├── 2_IMPLEMENTACION_PYTHON_UV.md # Pipeline de datos con uv y OSMnx
│   ├── 3_MOTOR_CPP_RUTACRAFT.md      # Motor nativo C++, KD-Tree y A*
│   ├── 4_INTEGRACION_TYPESCRIPT_ELECTRON.md # Wrapper npm y Electron
│   └── 5_RENDIMIENTO.md        # Benchmark del motor C++ (generado)
│
├── RutaCraftOSM_c/             # ⚡ Motor de Ruteo en C++20
│   ├── include/                # Cabeceras (kdtree, astar, grafo, cache, etc.)
│   ├── src/main.cpp            # CLI principal
│   ├── bin/cli.exe             # Binario estático compilado (generado, no versionado)
│   ├── bench/                  # Benchmark por fases (genera docs/5_RENDIMIENTO.md)
│   ├── tests/                  # Pruebas del CLI C++ y paridad con Python (unittest)
│   ├── CMakeLists.txt          # Build multiplataforma (MinGW, MSVC, GCC)
│   └── build.bat               # Atajo con g++ (-O3, -static)
│
├── RutaCraftOSM/               # 🐍 Pipeline de Datos en Python (con uv)
│   ├── geodatos/               # Polígonos GeoJSON
│   ├── grafos/                 # Grafos generados (.bin, .json, .pkl)
│   ├── tests/                  # Pruebas unitarias de Python
│   ├── preparar_grafo.py       # Extractor y exportador de grafos OSM
│   └── generar_grafos_benchmark.py # Grafo de Hermosillo para el benchmark
│
├── ruta-craft-osm/             # 📦 Paquete npm para Node.js / Electron
│   ├── bin/cli/                # cli.exe nativo y grafo binario
│   ├── src/index.ts            # Wrapper TypeScript
│   └── package.json            # Configuración npm
│
├── Libretas/                   # 📓 Jupyter Notebooks de análisis y pruebas
└── .github/workflows/ci.yml    # 🤖 CI: compila y prueba en Windows y Linux
```

---

## 🚀 Inicio Rápido

### 1. Preparar el grafo con Python y `uv`
```powershell
cd RutaCraftOSM
uv venv .venv
uv pip install osmnx geopandas shapely networkx ipykernel
uv run python preparar_grafo.py
```

### 2. Compilar el Motor en C++
```powershell
cd ../RutaCraftOSM_c
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release   # genera bin/cli.exe (o bin/cli en Linux)
```
En Windows con MinGW también sirve el atajo `.\build.bat`. Después copia `bin/cli.exe` a `ruta-craft-osm/bin/cli/` para actualizar el paquete npm.

### 3. Usar en tu proyecto Node.js / Electron
```powershell
# En la carpeta del wrapper
cd ../ruta-craft-osm
npm install
npm run build
npm link

# En tu aplicación de Electron
npm link ruta-craft-osm
```

```javascript
const { calcularRuta } = require('ruta-craft-osm');

const respuesta = await calcularRuta({
  puntos: [
    [29.065639, -110.056448],
    [29.062039, -110.059091],
    [29.059486, -110.053973]
  ]
});

console.log(`Distancia: ${respuesta.resultado.distancia_total_km} km`);
console.log(respuesta.resultado.instrucciones);
```

En Electron, para varias rutas seguidas usa el **motor persistente**, que carga el grafo una sola vez (detalles en la [guía de integración](./docs/4_INTEGRACION_TYPESCRIPT_ELECTRON.md)):

```javascript
const { crearMotorRutas } = require('ruta-craft-osm');

const motor = crearMotorRutas({ cachePath: path.join(app.getPath('userData'), 'cache_rutas.json') });
const resultado = await motor.calcular([[29.065639, -110.056448], [29.059486, -110.053973]]);
app.on('before-quit', () => motor.cerrar());
```

---

## 🧪 Pruebas

```powershell
# Motor C++: CLI, modo servidor, caché y paridad de ruta/distancia con el motor Python
python -m unittest RutaCraftOSM_c/tests/test_cpp_cli.py

# Motor Python (desde RutaCraftOSM/)
python -m unittest tests/test_cli.py tests/test_cli_errores.py

# Wrapper TypeScript (desde ruta-craft-osm/)
npm test
```

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) compila el motor en Windows y Linux, corre las tres suites en cada push a `main` y en cada pull request, y prueba el wrapper con el binario recién compilado.

### Benchmark

```powershell
cd RutaCraftOSM_c
cmake --build build --config Release --target cli benchmark
python bench/correr_benchmark.py
```

Regenera [`docs/5_RENDIMIENTO.md`](./docs/5_RENDIMIENTO.md), `docs/benchmark.json` y las rutas del [visualizador](./docs/visualizacion_ruta.html). El escenario de Hermosillo necesita antes `uv run python generar_grafos_benchmark.py` (desde `RutaCraftOSM/`).

---

## 📖 Documentación Detallada

Para consultar la guía técnica completa, revisa la carpeta [`docs/`](./docs/README.md):
* [🏛️ Arquitectura Global y Migración a C++](./docs/1_ARQUITECTURA_Y_MIGRACION.md)
* [🐍 Pipeline de Datos en Python con `uv`](./docs/2_IMPLEMENTACION_PYTHON_UV.md)
* [⚡ Motor de Ruteo en C++ (`RutaCraftOSM_c`)](./docs/3_MOTOR_CPP_RUTACRAFT.md)
* [📦 Integración TypeScript y Electron](./docs/4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
* [⏱️ Rendimiento del Motor C++](./docs/5_RENDIMIENTO.md)
* [🗺️ Visualizador de Rutas del Benchmark](./docs/visualizacion_ruta.html)
