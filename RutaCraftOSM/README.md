# 🐍 Versión original en Python (histórica)

Esta carpeta conserva la **primera versión de RutaCraftOSM**, escrita en Python, como muestra de cómo empezó el proyecto. Ya no forma parte del build, del paquete npm ni de la CI: desde la versión 0.2.0 el proyecto usa solo **C++** (motor) y **TypeScript** (paquete npm y generador de grafos).

| Archivo | Qué era | Reemplazo actual |
| :--- | :--- | :--- |
| `core.py`, `cli.py` | Motor de rutas original (empaquetado con Nuitka, ~1 s por ruta) | Motor C++ en [`RutaCraftOSM_c/`](../RutaCraftOSM_c/) (nativo y WebAssembly) |
| `preparar_grafo.py` | Generación del grafo con OSMnx | `npx ruta-craft-osm generar` ([2. Generador de grafos](../docs/2_GENERADOR_DE_GRAFOS.md)) |
| `formato_rco.py` | Lectura y escritura de RCO1/RCO2 | [`ruta-craft-osm/src/generador/rco2.ts`](../ruta-craft-osm/src/generador/rco2.ts) |
| `generar_grafos_benchmark.py` | Grafo de Hermosillo para el benchmark | `ruta-craft-osm generar --caja ...` |
| `tests/` | Pruebas del motor Python y comparación con C++ | [`ruta-craft-osm/test/`](../ruta-craft-osm/test/) |
| `grafos/` | Grafo de producción generado con OSMnx (`.bin`, `.json`, `.pkl`) | `ruta-craft-osm/bin/grafos/` (mismo contenido, regenerado en TypeScript) |
| `geodatos/` | Zona de ejemplo y ruta de prueba | [`datos/`](../datos/) |

También son de esa etapa:

- [`Libretas/`](../Libretas/): los notebooks de Jupyter donde se pensó originalmente el proyecto (análisis de la zona y primeras pruebas).
- [`RutaCraftOSM_c/tests/test_cpp_cli.py`](../RutaCraftOSM_c/tests/test_cpp_cli.py) y [`RutaCraftOSM_c/bench/correr_benchmark.py`](../RutaCraftOSM_c/bench/correr_benchmark.py): las pruebas y el benchmark del motor C++ en Python, reemplazados por `ruta-craft-osm/test/motor-nativo.test.mjs` y `RutaCraftOSM_c/bench/correr_benchmark.mjs`.

La guía original de esta versión (entorno con `uv`, `preparar_grafo.py`, formatos de salida) está en [GUIA_PIPELINE_PYTHON.md](./GUIA_PIPELINE_PYTHON.md).

## Ejecutarla

Los scripts siguen funcionando con su entorno original:

```powershell
cd RutaCraftOSM
uv venv .venv
uv pip install osmnx geopandas shapely networkx ipykernel
uv run python preparar_grafo.py
```

La historia de la migración a C++ y la comparación entre los dos motores están en [1. Arquitectura y migración](../docs/1_ARQUITECTURA_Y_MIGRACION.md#2-por-qué-se-migró-el-motor-de-python-a-c).
