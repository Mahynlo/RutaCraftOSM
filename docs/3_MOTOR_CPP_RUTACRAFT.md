# ⚡ 3. Motor de Ruteo en C++ (`RutaCraftOSM_c`)

El motor en C++20 implementa un sistema de navegación y cálculo de rutas autónomo de alto rendimiento, libre de dependencias externas.

---

## 1. Arquitectura de Cabeceras Modulares

```text
RutaCraftOSM_c/src/main.cpp     # CLI: parseo de opciones, modo clásico y modo servidor (--serve)
RutaCraftOSM_c/bench/           # Benchmark por fases (ver 5. Rendimiento)
RutaCraftOSM_c/include/
├── types.hpp           # Estructuras de datos base (Coordenada, Arista, Grafo, etc.)
├── geo_utils.hpp       # Fórmulas geométricas (Haversine, distancias planas y rumbos)
├── kdtree.hpp          # Índice espacial KD-Tree 2D para snapping ultra rápido
├── astar.hpp           # Algoritmo A* en memoria contigua
├── instrucciones.hpp   # Generador de maniobras giro a giro y consolidación
├── grafo.hpp           # Lector de formatos binarios (.bin RCO1) y JSON
├── cache.hpp           # Gestor de caché de rutas con persistencia JSON
├── ruta.hpp            # calcular_ruta(): snapping + A* por tramo + instrucciones (usado por la CLI y el benchmark)
└── json.hpp            # Parser y serializador JSON (nlohmann/json)
```

---

## 2. Especificación del Formato Binario `RCO1`

Para cargar rápido (~35 ms el grafo de producción, ver [benchmark](./5_RENDIMIENTO.md)), el grafo se empaqueta en una estructura binaria secuencial directa sin overhead de parsing de texto:

```
[0..3]     Magic Number: "RCO1" (4 bytes)
[4..7]     num_nodos: uint32 (4 bytes)

-- Bloque de Nodos (num_nodos repeticiones) --
   osm_id: int64 (8 bytes)
   lat:    float64 (8 bytes)
   lon:    float64 (8 bytes)

-- Bloque de Lista de Adyacencia (num_nodos repeticiones) --
   num_aristas: uint32 (4 bytes)
   -- Por cada arista --
      destino_idx: uint32 (4 bytes)  [Índice de 0 a num_nodos - 1]
      peso:        float32 (4 bytes) [Longitud en metros]
      len_calle:   uint16 (2 bytes)
      calle_utf8:  char[len_calle]
      len_tipo:    uint16 (2 bytes)
      tipo_utf8:   char[len_tipo]
```

---

## 3. Búsqueda Espacial con KD-Tree ($O(\log N)$)

En lugar de calcular distancias contra todos los nodos del mapa (escaneo $O(N)$), la clase `KDTree` en [`kdtree.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/kdtree.hpp) organiza las coordenadas geográficas en un árbol binario 2D:

* **Construcción**: Alterna particiones por `lat` (eje 0) y `lon` (eje 1) usando `std::nth_element` en $O(N \log N)$.
* **Búsqueda del nodo más cercano**: Poda ramas completas del árbol comparando la distancia al plano divisor antes de descender.
* **Tiempo por consulta**: $< 0.05\text{ ms}$ (apenas 15 operaciones para un mapa de 25,000 nodos).

---

## 4. Algoritmo A\* con Heurística Euclidiana Rápida

La clase `Enrutador` en [`astar.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/astar.hpp) implementa el algoritmo A\* optimizado para hardware moderno:

1. **Memoria Contigua**: Los arreglos `g_score`, `came_from` y `closed` son vectores contiguos (`std::vector<float>` y `std::vector<int>`) de tamaño $N$, indexados directamente por el ID interno del nodo ($0 \dots N-1$).
2. **Min-Heap de Alto Rendimiento**: `std::priority_queue` sobre `std::pair<float, int>`.
3. **Aproximación Euclidiana Equirrectangular**:
   Para la heurística de distancia estimada al destino en distancias urbanas/municipales:
   $$\Delta x = (\text{lon}_2 - \text{lon}_1) \cdot \cos(\text{lat}_{\text{media}}) \cdot 111320\text{ m}$$
   $$\Delta y = (\text{lat}_2 - \text{lat}_1) \cdot 110574\text{ m}$$
   $$d = \sqrt{\Delta x^2 + \Delta y^2}$$
   *Es **5x a 8x más rápida** que Haversine completo y tiene un error insignificante ($< 0.05\%$).*

---

## 5. Generación de Instrucciones de Navegación (*Turn-by-turn*)

En [`instrucciones.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/instrucciones.hpp):

1. **Cálculo del Ángulo de Giro**:
   Por cada tramo $u \to v \to w$:
   $$\text{giro} = (\text{rumbo}_{v \to w} - \text{rumbo}_{u \to v} + 360^\circ) \pmod{360^\circ}$$
2. **Clasificación de Maniobras**:
   * $\text{giro} < 30^\circ$ o $\text{giro} > 330^\circ$: `"Sigue recto"`
   * $30^\circ \le \text{giro} \le 180^\circ$: `"Gira a la derecha"`
   * $180^\circ < \text{giro} \le 330^\circ$: `"Gira a la izquierda"`
3. **Primer tramo**: el tramo inicial (nodo 0 → nodo 1) no tiene giro previo y se emite como `"Sigue recto"`, de modo que la suma de las instrucciones cubre la ruta completa.
4. **Consolidación Inteligente**:
   Si dos pasos sucesivos tienen la misma acción y el mismo nombre de calle, se fusionan acumulando sus distancias y actualizando el punto de destino.

> [!NOTE]
> Un giro y el `"Sigue recto"` que lo sigue en la misma calle no se fusionan, por lo que en zonas urbanas entre un 25% y un 41% de las instrucciones son redundantes (ver [5. Rendimiento](./5_RENDIMIENTO.md#3-instrucciones-de-navegación)).

---

## 6. Compilación del Motor

Para compilar el ejecutable estático autónomo `bin/cli.exe` con CMake (MinGW, MSVC o GCC en Linux):

```powershell
cd RutaCraftOSM_c
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

Atajo en Windows con MinGW (`build.bat`), equivalente a:
```powershell
g++ -O3 -std=c++20 -static -Iinclude src/main.cpp -o bin/cli.exe
```
* **Tamaño final**: ~3.5 MB
* **Dependencias**: Cero DLLs externas.

El benchmark se compila aparte (no se distribuye) y se ejecuta con:
```powershell
cmake --build build --config Release --target benchmark
python bench/correr_benchmark.py   # regenera docs/5_RENDIMIENTO.md, docs/benchmark.json y las rutas del visualizador
```

---

## 7. Uso de la CLI

```powershell
# Desde RutaCraftOSM_c/
$grafo = "..\RutaCraftOSM\grafos\grafo_mazatan_villapesqueira.bin"

# Ruta con coordenadas en la línea de comandos (lat lon lat lon ...)
.\bin\cli.exe --grafo $grafo --array 29.065639 -110.056448 29.059486 -110.053973 --sin-cache

# Puntos desde un archivo JSON [[lat, lon], ...] o un string JSON
.\bin\cli.exe --grafo $grafo --puntos paradas.json --salida ruta.json

# Modo servidor: una petición JSON por línea en stdin, una respuesta por línea en stdout
'{"id":1,"puntos":[[29.065639,-110.056448],[29.059486,-110.053973]]}' | .\bin\cli.exe --grafo $grafo --serve --sin-cache
```

> [!TIP]
> En el paquete npm (`ruta-craft-osm/bin/cli/`) el grafo está en `grafos/` junto al ejecutable, por lo que ahí no hace falta `--grafo`.

| Opción | Descripción |
| :--- | :--- |
| `--array lat lon ...` | Coordenadas en pares. Un número impar de valores es un error. |
| `--puntos <archivo o JSON>` | Ruta a un archivo JSON o un string JSON con `[[lat, lon], ...]`. |
| `--grafo <ruta>` | Grafo `.bin` (o `.json`). Por defecto `grafo_mazatan_villapesqueira.bin`; se busca en el directorio actual, junto al ejecutable y en `grafos/`. |
| `--salida <archivo>` | Guarda el resultado en un archivo en lugar de imprimirlo. |
| `--stdout` | Imprime `{"resultado": ..., "cache": ...}` (formato que usa `calcularRuta()`). Sin esta opción se imprime solo el resultado. |
| `--cache <archivo>` | Archivo de caché de tramos a leer y guardar. Por defecto `cache_rutas.json` en el directorio actual. |
| `--no-save-cache` | Lee el caché pero no lo guarda. |
| `--sin-cache` | No lee ni escribe ningún archivo de caché. |
| `--serve` | Modo servidor: carga el grafo una vez y atiende peticiones `{"id", "puntos"}` por stdin; responde `{"id", "ok", "resultado"}` o `{"id", "ok": false, "error"}`. El caché se guarda al cerrarse stdin. |

**Códigos de salida**: `0` si la ruta se calculó; `1` ante entradas inválidas, grafo inexistente o un tramo sin ruta posible. El detalle del error se escribe en stderr con el prefijo `Error(py):`.
