# 📚 Documentación Técnica de RutaCraftOSM

Bienvenido a la documentación oficial y completa de **RutaCraftOSM**.

---

## 🗺️ Índice de Contenidos

1. [🏛️ Arquitectura Global y Migración a C++](./1_ARQUITECTURA_Y_MIGRACION.md)
   - Visión general del sistema híbrido.
   - Motivación de la migración de Python a C++.
   - Validación de la migración: misma ruta y distancia que el motor Python.
   - Tabla de equivalencia funcional 1:1.

2. [🐍 Pipeline de Datos en Python con `uv`](./2_IMPLEMENTACION_PYTHON_UV.md)
   - Gestión de dependencias con `uv`.
   - Extracción de geometrías y límites municipales desde OpenStreetMap.
   - Generación de grafos con OSMnx, GeoPandas y Shapely.
   - Exportadores a formatos `.bin`, `.pkl` y `.json`.
   - Opción para respetar las calles de un solo sentido y grafo de Hermosillo para el benchmark.

3. [⚡ Motor de Ruteo en C++ (`RutaCraftOSM_c`)](./3_MOTOR_CPP_RUTACRAFT.md)
   - Arquitectura modular del código C++20.
   - Estructura y especificación del formato binario `RCO1`.
   - Búsqueda espacial $O(\log N)$ con KD-Tree.
   - Algoritmo A\* con heurística euclidiana plana en memoria contigua.
   - Generador de maniobras giro a giro (*turn-by-turn*) y consolidación.
   - Compilación con CMake o `build.bat` (binario estático).
   - Referencia completa de la CLI, incluido el modo servidor (`--serve`).

4. [📦 Integración TypeScript y Electron (`ruta-craft-osm`)](./4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
   - `calcularRuta()` (un proceso por llamada) y motor persistente `crearMotorRutas()`.
   - Detección automática de empaquetado Electron (`app.asar.unpacked`).
   - Interfaces y tipos de TypeScript.
   - Instalación local (`npm link` o `npm pack`) y ejemplos de uso en Electron.

5. [⏱️ Rendimiento del Motor C++](./5_RENDIMIENTO.md)
   - Tiempos medidos de carga, KD-Tree, A\* y ruta completa (generados con `bench/correr_benchmark.py`).
   - Escalamiento del grafo rural de producción a la ciudad de Hermosillo.
   - Calidad de las instrucciones e impacto de las calles de un solo sentido.

6. [🗺️ Visualizador y Comparador Web Interactivo](./visualizacion_ruta.html)
   - Herramienta visual basada en Leaflet con las rutas de los escenarios del benchmark (Mazatán y Hermosillo).
   - Comparación superpuesta de la ruta ignorando y respetando los sentidos de las calles.
   - Enlaces directos a un escenario: `visualizacion_ruta.html?escenario=hermosillo-2&modo=compare`.
   - Tarjetas de navegación giro a giro en tiempo real.
   - Abre directamente con doble clic en cualquier navegador web.

---

## 📁 Mapa de Carpetas del Proyecto

```text
RutaCraftOSM/
├── docs/                       # Documentación técnica completa y sitio web interactivo
│   ├── css/                    # Estilos modulares (theme, landing, docs, visualizador)
│   ├── js/                     # Lógica modular (docs, visualizador, landing, rutas_benchmark)
│   ├── 1_ARQUITECTURA_Y_MIGRACION.md
│   ├── 2_IMPLEMENTACION_PYTHON_UV.md
│   ├── 3_MOTOR_CPP_RUTACRAFT.md
│   ├── 4_INTEGRACION_TYPESCRIPT_ELECTRON.md
│   ├── 5_RENDIMIENTO.md        # Generado por RutaCraftOSM_c/bench/correr_benchmark.py
│   ├── benchmark.json          # Datos crudos del benchmark
│   ├── index.html              # Portada y portal de documentación
│   ├── doc.html                # Lector Markdown interactivo
│   ├── visualizacion_ruta.html # Visualizador Leaflet y comparador de rutas
│   └── README.md               # Índice general
│
├── RutaCraftOSM/               # Módulo Python (Pipeline de datos geográficos con uv)
│   ├── .venv/                  # Entorno virtual gestionado con uv
│   ├── geodatos/               # Polígonos GeoJSON y datos de prueba
│   ├── grafos/                 # Archivos de grafo generados (.bin, .pkl, .json)
│   ├── tests/                  # Pruebas unitarias de Python y scripts de comparación
│   ├── preparar_grafo.py       # Extractor y exportador de grafos OSM
│   ├── generar_grafos_benchmark.py # Descarga el grafo de Hermosillo para el benchmark
│   ├── core.py                 # Motor Python de referencia (paridad)
│   └── cli.py                  # CLI del motor Python de referencia
│
├── RutaCraftOSM_c/             # Motor de Ruteo Nativo de Alto Rendimiento en C++
│   ├── include/                # Cabeceras modulares (kdtree, astar, grafo, etc.)
│   ├── src/main.cpp            # CLI principal de C++
│   ├── bin/cli.exe             # Ejecutable compilado autónomo (generado)
│   ├── bench/                  # Benchmark por fases y generador de 5_RENDIMIENTO.md
│   ├── tests/                  # Pruebas automatizadas del motor C++
│   ├── CMakeLists.txt          # Build multiplataforma
│   └── build.bat               # Script de compilación estática (MinGW)
│
├── ruta-craft-osm/             # Paquete npm para Node.js y Electron
│   ├── bin/cli/                # cli.exe nativo y grafo binario
│   ├── src/index.ts            # Wrapper TypeScript
│   ├── src/test-motor.cjs      # Pruebas del wrapper (npm test)
│   ├── dist/                   # Código JavaScript compilado (.js, .d.ts)
│   └── package.json            # Configuración del paquete npm
│
├── Libretas/                   # Jupyter Notebooks de análisis y pruebas visuales
├── .github/workflows/ci.yml    # CI: compila y prueba en Windows y Linux
└── README.md                   # README principal del repositorio
```
