# 📚 Documentación Técnica de RutaCraftOSM

**RutaCraftOSM** es una librería ligera para generar rutas de múltiples puntos por calles reales, sin conexión, dentro de una zona específica, sin instalar un servidor de ruteo como OSRM. Calcula la ruta más corta en distancia que recorre una lista de paradas, con instrucciones en español, sobre un grafo de OpenStreetMap de la zona que se elija. Un ejemplo de uso es AguaVP, que genera con ella sus rutas de lectura de medidores. Lo que hace, lo que aún no hace y las posibles mejoras están en [1. Arquitectura: propósito y alcance](./1_ARQUITECTURA_Y_MIGRACION.md).

---

## 🗺️ Índice de Contenidos

1. [🏛️ Arquitectura Global y Migración a C++](./1_ARQUITECTURA_Y_MIGRACION.md)
   - Propósito, comparación con un servidor de ruteo, alcance y posibles mejoras.
   - Visión general de las tres capas.
   - Motivación de la migración de Python a C++.
   - Validación de la migración: misma ruta y distancia que el motor Python.
   - Tabla de equivalencia funcional 1:1.

2. [🐍 Pipeline de Datos en Python con `uv`](./2_IMPLEMENTACION_PYTHON_UV.md)
   - Gestión de dependencias con `uv`.
   - Extracción de geometrías y límites municipales desde OpenStreetMap.
   - Generación de grafos con OSMnx, GeoPandas y Shapely.
   - Exportadores a formatos `.bin`, `.pkl` y `.json`.
   - Opción para respetar las calles de un solo sentido y grafo de Hermosillo para el benchmark.

3. [⚙️ Motor de Rutas en C++ (`RutaCraftOSM_c`)](./3_MOTOR_CPP_RUTACRAFT.md)
   - Arquitectura modular del código C++20.
   - Especificación del formato binario `RCO2` (y compatibilidad con `RCO1`).
   - Búsqueda espacial $O(\log N)$ con KD-Tree.
   - Algoritmo A\* con heurística euclidiana plana en memoria contigua.
   - Instrucciones giro a giro agrupadas por calle.
   - Compilación con CMake o `build.bat` (binario estático).
   - Referencia completa de la CLI, modo servidor (`--serve`) y códigos de error.
   - Optimización del orden de las paradas (exacto y heurístico).

4. [📦 Integración TypeScript y Electron (`ruta-craft-osm`)](./4_INTEGRACION_TYPESCRIPT_ELECTRON.md)
   - `calcularRuta()` (un proceso por llamada) y motor persistente `crearMotorRutas()`.
   - Optimización del orden de las paradas y errores tipados (`ErrorRutaCraft`).
   - Detección automática de empaquetado Electron (`app.asar.unpacked`).
   - Interfaces y tipos de TypeScript.
   - Instalación local (`npm link` o `npm pack`) y ejemplos de uso en Electron.

5. [⏱️ Rendimiento del Motor C++](./5_RENDIMIENTO.md)
   - Tiempos medidos de carga, KD-Tree, A\* y ruta completa (generados con `bench/correr_benchmark.py`).
   - Comparación entre una zona rural (Mazatán - Villa Pesqueira) y una ciudad (Hermosillo).
   - Calidad de las instrucciones, ahorro al optimizar el orden e impacto de las calles de un solo sentido.

6. [🗺️ Visualizador y Comparador Web Interactivo](./visualizacion_ruta.html)
   - Herramienta visual basada en Leaflet con las rutas de los escenarios del benchmark (Mazatán y Hermosillo).
   - Comparación superpuesta de la ruta ignorando y respetando los sentidos de las calles.
   - Enlaces directos a un escenario: `visualizacion_ruta.html?escenario=hermosillo-2&modo=compare`.
   - Simulación animada del recorrido con el aviso de cada instrucción.
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
│   ├── formato_rco.py          # Lectura/escritura de RCO1 y RCO2
│   ├── generar_grafos_benchmark.py # Descarga el grafo de Hermosillo para el benchmark
│   ├── core.py                 # Motor Python de referencia (paridad)
│   └── cli.py                  # CLI del motor Python de referencia
│
├── RutaCraftOSM_c/             # Motor de rutas en C++
│   ├── include/                # Cabeceras modulares (kdtree, astar, grafo, etc.)
│   ├── src/main.cpp            # CLI principal de C++
│   ├── bin/cli.exe             # Ejecutable compilado (generado)
│   ├── bench/                  # Benchmark por fases y generador de 5_RENDIMIENTO.md
│   ├── tests/                  # Pruebas automatizadas del motor C++
│   ├── CMakeLists.txt          # Build multiplataforma
│   └── build.bat               # Script de compilación estática (MinGW)
│
├── ruta-craft-osm/             # Paquete npm para Node.js y Electron
│   ├── bin/<plataforma>/       # Motor por plataforma (win32-x64, linux-x64, darwin-x64, darwin-arm64)
│   ├── bin/grafos/             # Grafo RCO2 incluido
│   ├── src/index.ts            # Wrapper TypeScript
│   ├── src/test-motor.cjs      # Pruebas del wrapper (npm test)
│   ├── dist/                   # Código JavaScript compilado (.js, .d.ts)
│   └── package.json            # Configuración del paquete npm
│
├── Libretas/                   # Jupyter Notebooks de análisis y pruebas visuales
├── .github/workflows/ci.yml    # CI: compila y prueba en Windows, Linux y macOS
└── README.md                   # README principal del repositorio
```
