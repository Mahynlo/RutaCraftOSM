# 🚗 RutaCraftOSM (Calculadora de Rutas de Alto Rendimiento con OSM)

**RutaCraftOSM** es un motor de navegación y cálculo de rutas óptimas 100% offline basado en grafos viales de OpenStreetMap (OSM). Integra un pipeline de datos geográficos en Python gestionado con **`uv`**, un **motor de alto rendimiento en C++17** con indexación espacial **KD-Tree** y un **wrapper tipado en TypeScript/npm** listo para aplicaciones de escritorio en **Electron** y **Node.js**.

---

## ⚡ Características Principales

* 🧭 **Multi-paradas**: Soporta origen, múltiples paradas intermedias y destino.
* ⚡ **Ultra Rápido**: Motor nativo en C++17 que calcula rutas multi-parada en **~50 ms** (16x más rápido).
* 🌲 **Snapping $O(\log N)$ con KD-Tree**: Búsqueda del nodo más cercano instantánea sin evaluar linealmente todo el grafo.
* 📦 **Formato Binario `RCO1`**: Carga de grafos de decenas de miles de nodos en **< 1 ms**.
* 🧾 **Instrucciones Tipo GPS (*Turn-by-turn*)**: Maniobras de giro (*"Sigue recto"*, *"Gira a la derecha"*), nombres de calles y consolidación de tramos.
* 🔌 **Integración Transparente con Electron**: Detección automática en entornos de producción empaquetados (`app.asar.unpacked`).
* 🐍 **Gestión Moderna con `uv`**: Extracción y preparación de datos geográficos reproducible y rápida.

---

## 📁 Estructura del Repositorio

```bash
RutaCraftOSM/
├── docs/                       # 📚 Documentación técnica detallada
│   ├── README.md               # Índice general de documentación
│   ├── 1_ARQUITECTURA_Y_MIGRACION.md # Arquitectura y benchmarks Python vs C++
│   ├── 2_IMPLEMENTACION_PYTHON_UV.md # Pipeline de datos con uv y OSMnx
│   ├── 3_MOTOR_CPP_RUTACRAFT.md      # Motor nativo C++, KD-Tree y A*
│   └── 4_INTEGRACION_TYPESCRIPT_ELECTRON.md # Wrapper npm y Electron
│
├── RutaCraftOSM_c/             # ⚡ Motor de Ruteo en C++17
│   ├── include/                # Cabeceras (kdtree, astar, grafo, cache, etc.)
│   ├── src/main.cpp            # CLI principal
│   ├── bin/cli.exe             # Binario estático compilado
│   ├── tests/                  # Pruebas unitarias en C++
│   └── build.bat               # Compilador con g++ (-O3, -static)
│
├── RutaCraftOSM/               # 🐍 Pipeline de Datos en Python (con uv)
│   ├── geodatos/               # Polígonos GeoJSON
│   ├── grafos/                 # Grafos generados (.bin, .json, .pkl)
│   ├── tests/                  # Pruebas unitarias de Python
│   └── preparar_grafo.py       # Extractor y exportador de grafos OSM
│
├── ruta-craft-osm/             # 📦 Paquete npm para Node.js / Electron
│   ├── bin/cli/                # cli.exe nativo y grafo binario
│   ├── src/index.ts            # Wrapper TypeScript
│   └── package.json            # Configuración npm
│
└── Libretas/                   # 📓 Jupyter Notebooks de análisis y pruebas
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
.\build.bat
```

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

---

## 📖 Documentación Detallada

Para consultar la guía técnica completa, revisa la carpeta [`docs/`](./docs/README.md):
* [🏛️ Arquitectura Global y Migración a C++](./docs/1_ARQUITECTURA_Y_MIGRACION.md)
* [🐍 Pipeline de Datos en Python con `uv`](./docs/2_IMPLEMENTACION_PYTHON_UV.md)
* [⚡ Motor de Ruteo en C++ (`RutaCraftOSM_c`)](./docs/3_MOTOR_CPP_RUTACRAFT.md)
* [📦 Integración TypeScript y Electron](./docs/4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
* [🗺️ Visualizador y Comparador Web Interactivo](./docs/visualizacion_ruta.html)
