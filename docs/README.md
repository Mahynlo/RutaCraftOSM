# 📚 Documentación Técnica de RutaCraftOSM

Bienvenido a la documentación oficial y completa de **RutaCraftOSM**.

---

## 🗺️ Índice de Contenidos

1. [🏛️ Arquitectura Global y Migración a C++](./1_ARQUITECTURA_Y_MIGRACION.md)
   - Visión general del sistema híbrido.
   - Motivación de la migración de Python a C++.
   - Comparativa de rendimiento y benchmarks reales.
   - Tabla de equivalencia funcional 1:1.

2. [🐍 Pipeline de Datos en Python con `uv`](./2_IMPLEMENTACION_PYTHON_UV.md)
   - Gestión de dependencias con `uv`.
   - Extracción de geometrías y límites municipales desde OpenStreetMap.
   - Generación de grafos con OSMnx, GeoPandas y Shapely.
   - Exportadores a formatos `.bin`, `.pkl` y `.json`.

3. [⚡ Motor de Ruteo en C++ (`RutaCraftOSM_c`)](./3_MOTOR_CPP_RUTACRAFT.md)
   - Arquitectura modular del código C++17.
   - Estructura y especificación del formato binario `RCO1`.
   - Búsqueda espacial $O(\log N)$ con KD-Tree.
   - Algoritmo A\* con heurística euclidiana plana en memoria contigua.
   - Generador de maniobras giro a giro (*turn-by-turn*) y consolidación.
   - Compilación nativa estática con `g++`.

4. [📦 Integración TypeScript y Electron (`ruta-craft-osm`)](./4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
   - Wrapper de Node.js mediante subprocesos (`spawn`).
   - Detección automática de empaquetado Electron (`app.asar.unpacked`).
   - Interfaces y tipos de TypeScript.
   - Guía de instalación local (`npm link`) y ejemplos de uso.

---

## 📁 Mapa de Carpetas del Proyecto

```text
RutaCraftOSM/
├── docs/                       # Documentación técnica completa y visualizaciones
│   ├── README.md               # Índice principal (este archivo)
│   ├── 1_ARQUITECTURA_Y_MIGRACION.md
│   ├── 2_IMPLEMENTACION_PYTHON_UV.md
│   ├── 3_MOTOR_CPP_RUTACRAFT.md
│   ├── 4_INTEGRACION_TYPESCRIPT_ELECTRON.md
│   └── visualizacion_ruta.html
│
├── RutaCraftOSM/               # Módulo Python (Pipeline de datos geográficos con uv)
│   ├── .venv/                  # Entorno virtual gestionado con uv
│   ├── geodatos/               # Polígonos GeoJSON y datos de prueba
│   ├── grafos/                 # Archivos de grafo generados (.bin, .pkl, .json)
│   ├── tests/                  # Pruebas unitarias de Python y scripts de comparación
│   ├── preparar_grafo.py       # Extractor y exportador de grafos OSM
│   ├── core.py                 # Core histórico de Python
│   └── cli.py                  # CLI histórico de Python
│
├── RutaCraftOSM_c/             # Motor de Ruteo Nativo de Alto Rendimiento en C++
│   ├── include/                # Cabeceras modulares (kdtree, astar, grafo, etc.)
│   ├── src/main.cpp            # CLI principal de C++
│   ├── bin/cli.exe             # Ejecutable compilado autónomo
│   ├── tests/                  # Pruebas automatizadas del motor C++
│   └── build.bat               # Script de compilación estática
│
├── ruta-craft-osm/             # Paquete npm para Node.js y Electron
│   ├── bin/cli/                # cli.exe nativo y grafo binario
│   ├── src/index.ts            # Wrapper TypeScript
│   ├── dist/                   # Código JavaScript compilado (.js, .d.ts)
│   └── package.json            # Configuración del paquete npm
│
├── Libretas/                   # Jupyter Notebooks de análisis y pruebas visuales
└── README.md                   # README principal del repositorio
```
