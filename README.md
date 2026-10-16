# 🚗 RutaCraftOSM

**RutaCraftOSM** es una librería ligera para **generar rutas de múltiples puntos** por calles reales, **sin conexión a internet**, dentro de una zona específica.

Su objetivo es que una aplicación pueda calcular rutas en su propia zona de trabajo (un municipio, una ciudad, un conjunto de colonias) **sin instalar ni operar un servidor de ruteo** como OSRM, GraphHopper o Valhalla. No hace falta Docker, base de datos ni procesar el mapa de un país: basta con un archivo de grafo de pocos MB y un ejecutable incluido en el paquete npm.

Tiene tres partes:

1. **Un script en Python** (con `uv` y OSMnx) que descarga de OpenStreetMap las calles de la zona que elijas y las guarda en un archivo binario.
2. **Un ejecutable en C++** que carga ese archivo y calcula las rutas.
3. **Un paquete npm** (`ruta-craft-osm`) para usarlo desde Node.js o Electron.

**Ejemplo de uso:** AguaVP, un sistema de gestión de agua potable, la usa para generar las rutas de lectura de medidores. El paquete incluye como grafo de ejemplo el de los municipios de Mazatán y Villa Pesqueira (Sonora), y también se probó con la ciudad de Hermosillo.

---

## 🎯 Alcance

### Qué hace

Recibe una lista de coordenadas `[lat, lon]` (inicio y paradas) y devuelve:

- **La ruta más corta en distancia** por la red de calles para visitarlas en el orden dado, como polilínea de coordenadas.
- **La distancia total** en metros y kilómetros.
- **Instrucciones en español**, una por calle: *"Sigue recto"*, *"Gira a la derecha en Calle Morelos"*, con la distancia de cada tramo.
- **Opcionalmente, un mejor orden de visita**: reordena las paradas para recorrer menos distancia. Puede volver al inicio o mantener una parada final.

Funciona con el grafo de cualquier zona que se genere con el script de Python, siempre que sea de un tamaño manejable: se probó desde zonas rurales de 25 mil nodos hasta una ciudad de 75 mil.

### Qué no hace todavía

La versión actual es intencionalmente simple. Estas son sus limitaciones; varias son mejoras posibles a futuro:

- **Distancia, no tiempo.** Minimiza metros. Aún no usa velocidades, tipos de vía ni tráfico, y no estima tiempos de llegada.
- **Sentidos de las calles.** El grafo de ejemplo los ignora, así que una ruta puede ir en contrasentido. El motor ya acepta grafos que los respetan (opción `respetar_sentido` del script de Python).
- **Sin restricciones de giro** (giros prohibidos, etc.).
- **Solo automóvil.** No hay perfiles de peatón ni de bicicleta.
- **Paradas al nodo más cercano.** Cada parada se ajusta al cruce o punto de calle más cercano del grafo, no al punto exacto sobre la calle.
- **Una zona por grafo.** Solo hay ruta dentro del grafo cargado. No está pensado para grafos muy grandes, como un estado o un país completo.
- **Sin guía en tiempo real.** Las instrucciones se calculan una vez; no siguen la posición del usuario ni recalculan.
- **Optimización simple del orden:** un vehículo, sin ventanas de horario ni capacidades. Con hasta 9 paradas el orden es el óptimo exacto; con más es una aproximación pensada para decenas de paradas (50 paradas en ~0.5 s).
- **Nombres de calle.** Dependen de OpenStreetMap: las calles sin nombre aparecen como `"desconocida"`.

### Por qué en C++

La primera versión era Python empaquetado con Nuitka: tardaba ~1 s por ruta y pesaba más de 15 MB en DLLs. El ejecutable en C++ da exactamente la misma ruta y distancia. Tarda ~30–60 ms si se lanza una vez por ruta y menos de 1 ms con el grafo ya cargado (motor persistente). Usa unos 8 MB de memoria con el grafo de ejemplo. Las cifras están medidas en [5. Rendimiento](./docs/5_RENDIMIENTO.md).

---

## ⚙️ Funcionalidades

* 🧭 **Rutas multi-parada**: inicio, paradas intermedias y final, en el orden recibido.
* 🔀 **Optimización del orden de las paradas** (opcional): en rutas de prueba con las paradas desordenadas, la distancia baja entre 63% y 74%.
* 🧾 **Instrucciones agrupadas por calle**: tipos de giro (ligero, normal, brusco, vuelta en U) y sin tramos de menos de 15 m.
* 🗺️ **Grafo de la zona que elijas**: se genera desde OpenStreetMap con el script de Python, a partir de polígonos GeoJSON.
* 🌲 **Ajuste rápido de cada parada al grafo** con un KD-Tree, y A\* sobre el grafo cargado en arreglos contiguos.
* 📦 **Grafo en formato binario `RCO2`**: 1.3 MB para una zona de 25 mil nodos, se carga en ~2 ms.
* 💾 **Caché de tramos** en un archivo JSON: los tramos ya calculados no se recalculan.
* 🔌 **Pensado para Electron**:
  * Motor persistente (`crearMotorRutas()`) que carga el grafo una sola vez.
  * Funciona dentro de la app empaquetada (`app.asar.unpacked`).
  * Errores con código (`ErrorRutaCraft.codigo`).
* 💻 **Multiplataforma**: binarios para Windows x64, Linux x64 y macOS (Intel y Apple Silicon), compilados y probados en CI.

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
├── RutaCraftOSM_c/             # ⚙️ Motor de rutas en C++20
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
│   ├── formato_rco.py          # Lectura/escritura de RCO1 y RCO2, conversión entre formatos
│   └── generar_grafos_benchmark.py # Grafo de Hermosillo para el benchmark
│
├── ruta-craft-osm/             # 📦 Paquete npm para Node.js / Electron
│   ├── bin/<plataforma>/       # Motor por plataforma (win32-x64, linux-x64, darwin-x64, darwin-arm64)
│   ├── bin/grafos/             # Grafo RCO2 incluido (compartido)
│   ├── src/index.ts            # Wrapper TypeScript
│   └── package.json            # Configuración npm
│
├── Libretas/                   # 📓 Jupyter Notebooks de análisis y pruebas
└── .github/workflows/ci.yml    # 🤖 CI: compila y prueba en Windows, Linux y macOS
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
En Windows con MinGW también sirve el atajo `.\build.bat`. Después copia el binario a `ruta-craft-osm/bin/<plataforma>/` (por ejemplo `bin/win32-x64/cli.exe`) para actualizar el paquete npm. La CI genera además un paquete con los binarios de las cuatro plataformas (artefacto `ruta-craft-osm-multiplataforma`).

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

// Optimizar el orden de las paradas y volver al inicio
const optimizada = await motor.calcular(paradas, { optimizar: true, regresarAlInicio: true });
console.log(optimizada.orden, optimizada.optimizacion);
```

El paquete tiene su propio [README](./ruta-craft-osm/README.md) y un [CHANGELOG](./ruta-craft-osm/CHANGELOG.md) por versión.

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

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) compila el motor en Windows, Linux y macOS, corre las tres suites en cada push a `main` y en cada pull request, y prueba el wrapper con el binario recién compilado.

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
* [⚙️ Motor de Rutas en C++ (`RutaCraftOSM_c`)](./docs/3_MOTOR_CPP_RUTACRAFT.md)
* [📦 Integración TypeScript y Electron](./docs/4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
* [⏱️ Rendimiento del Motor C++](./docs/5_RENDIMIENTO.md)
* [🗺️ Visualizador de Rutas del Benchmark](./docs/visualizacion_ruta.html)
