# ⚙️ 3. Motor de Rutas en C++ (`RutaCraftOSM_c`)

El motor es un ejecutable de C++20 sin dependencias externas: carga el grafo, ajusta cada parada al nodo más cercano, calcula la ruta más corta en distancia entre paradas consecutivas y genera las instrucciones. Se usa desde la línea de comandos o desde el paquete npm. Su alcance (distancia y no tiempo, sin restricciones de giro, zona fija) está en [1. Propósito y alcance](./1_ARQUITECTURA_Y_MIGRACION.md).

---

## 1. Arquitectura de Cabeceras Modulares

```text
RutaCraftOSM_c/src/main.cpp     # CLI: parseo de opciones, modo clásico y modo servidor (--serve)
RutaCraftOSM_c/bench/           # Benchmark por fases (ver 5. Rendimiento)
RutaCraftOSM_c/include/
├── types.hpp           # Coordenada, Grafo (formato CSR) e Instruccion
├── geo_utils.hpp       # Fórmulas geométricas (Haversine, distancias planas y rumbos)
├── kdtree.hpp          # Índice espacial KD-Tree 2D para ajustar cada parada al nodo más cercano
├── astar.hpp           # A* (ruta entre dos nodos) y Dijkstra de uno a varios (matriz de distancias)
├── optimizar.hpp       # Optimización del orden de las paradas (exacto o 2-opt + Or-opt)
├── errores.hpp         # Tipos de error y códigos de salida
├── instrucciones.hpp   # Generador de maniobras giro a giro y consolidación
├── grafo.hpp           # Cargador de grafos RCO2, RCO1 (compatibilidad) y JSON
├── archivos.hpp        # Rutas UTF-8, argumentos Unicode y ubicación del ejecutable por sistema operativo
├── cache.hpp           # Gestor de caché de rutas con persistencia JSON
├── ruta.hpp            # calcular_ruta(): snapping + orden + A* por tramo + instrucciones (CLI y benchmark)
└── json.hpp            # Parser y serializador JSON (nlohmann/json)
```

---

## 2. Especificación del Formato Binario `RCO2`

El grafo se guarda como arreglos contiguos en formato **CSR** (*Compressed Sparse Row*): el motor lee el archivo de una vez y copia cada bloque directamente a memoria, sin interpretar arista por arista. Cada nombre de calle se guarda una sola vez. Todos los valores son *little-endian*:

```
Encabezado (32 bytes)
   char[4]  "RCO2"
   uint32   versión (2)
   uint32   flags            bit 0: respeta los sentidos de las calles
   uint32   N                nodos
   uint32   E                aristas
   uint32   K                nombres de calle (el id 0 es "" = calle sin nombre)
   uint32   B                bytes de la tabla de nombres
   uint32   reservado (0)
int64    osm_ids[N]
float64  coords[2N]           lat, lon intercalados
uint32   inicio_aristas[N+1]  aristas del nodo u: [inicio_aristas[u], inicio_aristas[u+1])
uint32   destino[E]           índice del nodo destino
float32  peso[E]              longitud en metros
uint32   nombre_id[E]         índice en la tabla de nombres
uint32   inicio_nombres[K+1]
uint8    nombres[B]           UTF-8 concatenado
```

* **Validación**: el tamaño esperado se calcula con el encabezado, así que un archivo truncado o con datos de más se rechaza. También se verifica que todos los índices estén en rango, para que un archivo corrupto no provoque accesos fuera de memoria.
* **Compatibilidad**: el motor sigue cargando el formato histórico `RCO1` (y JSON) y lo convierte a la misma estructura en memoria. [`formato_rco.py`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM/formato_rco.py) convierte archivos `RCO1` a `RCO2`.

| Grafo | RCO1 | RCO2 |
| :--- | ---: | ---: |
| Mazatán - Villa Pesqueira (24 mil nodos) | 4.1 MB · carga 32 ms · 15.8 MB en memoria | 1.3 MB · carga ~2 ms · 7.9 MB |
| Ciudad de Hermosillo (75 mil nodos) | 13.5 MB · carga 106 ms · 47 MB en memoria | 4.3 MB · carga ~6 ms · 19.2 MB |

---

## 3. Búsqueda Espacial con KD-Tree ($O(\log N)$)

En lugar de calcular distancias contra todos los nodos del mapa (escaneo $O(N)$), la clase `KDTree` en [`kdtree.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/kdtree.hpp) organiza las coordenadas geográficas en un árbol binario 2D:

* **Construcción**: Alterna particiones por `lat` (eje 0) y `lon` (eje 1) usando `std::nth_element` en $O(N \log N)$.
* **Búsqueda del nodo más cercano**: Poda ramas completas del árbol comparando la distancia al plano divisor antes de descender. Esa distancia se calcula como cota inferior exacta sobre la esfera (a lo largo del meridiano para un paralelo, $R \cdot \arcsin(\cos(\text{lat}) \cdot \sin(\Delta\text{lon}))$ para un meridiano), así que la poda nunca descarta la rama donde está el nodo más cercano. Una prueba compara el resultado con una búsqueda exhaustiva.
* **Tiempo por consulta**: $< 0.05\text{ ms}$ (apenas 15 operaciones para un mapa de 25,000 nodos).

---

## 4. Algoritmo A\* con Heurística Euclidiana Rápida

La clase `Enrutador` en [`astar.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/astar.hpp) implementa el algoritmo A\* optimizado para hardware moderno:

1. **Memoria reutilizada**: `g`, `padre`, `cerrado` y el montículo se reservan una sola vez (por hilo) y se reutilizan en cada búsqueda. Una marca de "generación" indica qué valores pertenecen a la búsqueda actual, así que no hay que reiniciar arreglos de tamaño $N$ por cada tramo de la ruta.
2. **Cola de prioridad (min-heap)**: `std::priority_queue` sobre `std::pair<float, int>`.
3. **Aproximación Euclidiana Equirrectangular**:
   Para la heurística de distancia estimada al destino:
   $$\Delta x = (\text{lon}_2 - \text{lon}_1) \cdot \cos(\text{lat}_{\text{media}}) \cdot \frac{\pi R}{180}$$
   $$\Delta y = (\text{lat}_2 - \text{lat}_1) \cdot \frac{\pi R}{180}$$
   $$h = 0.999 \cdot \sqrt{\Delta x^2 + \Delta y^2}, \quad R = 6{,}371{,}000\text{ m}$$
   *Es **5x a 8x más rápida** que Haversine completo.*
4. **Heurística admisible**: para que A\* garantice la ruta más corta, $h$ nunca debe superar la distancia real. Se usa el radio medio de la Tierra (menor que los 6,371,009 m con los que OSMnx mide las aristas) y un margen de 0.1%, mayor que el error máximo de la aproximación plana (~0.0125% a 400 km). Una prueba compara la distancia del motor con Dijkstra exacto en pares de nodos al azar.

---

## 5. Generación de Instrucciones de Navegación (*Turn-by-turn*)

En [`instrucciones.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/instrucciones.hpp) la ruta se describe por **tramos de calle**, no por segmento:

1. **Agrupación por calle**: las aristas consecutivas con el mismo nombre de calle forman un solo tramo. Un tramo solo se divide si dentro de él hay un giro muy cerrado (más de 120°, por ejemplo una vuelta en U) o, en vías sin nombre, un giro de más de 45°.
2. **Ángulo de giro suavizado**: el giro en el inicio de cada tramo se mide entre la dirección de los ~15 m anteriores y la de los ~15 m posteriores. Medirlo con un solo segmento daba ruido, porque con `simplify=False` hay segmentos de pocos metros. El rumbo escala la diferencia de longitud por $\cos(\text{lat})$.
   $$\text{giro} = \text{rumbo}_{\text{salida}} - \text{rumbo}_{\text{entrada}} \in (-180^\circ, 180^\circ], \quad \text{positivo} = \text{derecha}$$
3. **Tramos cortos**: los de menos de 15 m no generan instrucción propia. Una desviación corta entre dos tramos de la misma calle se une a esa calle; en otro caso se absorbe en el tramo siguiente.
4. **Clasificación de maniobras** (por valor absoluto del giro):

   | Giro | Acción |
   | :--- | :--- |
   | < 30° | `"Sigue recto"` |
   | 30° – 60° | `"Gira ligeramente a la derecha"` / `"... a la izquierda"` |
   | 60° – 135° | `"Gira a la derecha"` / `"Gira a la izquierda"` |
   | 135° – 165° | `"Gira bruscamente a la derecha"` / `"... a la izquierda"` |
   | ≥ 165° | `"Da vuelta en U"` |

5. **Primer tramo**: se emite como `"Sigue recto"`. Las distancias de todas las instrucciones suman la ruta completa.

Comparado con la versión anterior (que consolidaba segmento por segmento), las mismas rutas generan entre 40% y 50% menos instrucciones y ninguna de menos de 15 m; los detalles están en [5. Rendimiento](./5_RENDIMIENTO.md#3-instrucciones-de-navegación).

---

## 6. Compilación del Motor

Para compilar el ejecutable `bin/cli.exe` (`bin/cli` en Linux y macOS) con CMake (MinGW, MSVC, GCC o Clang). En Windows (MinGW) y Linux el binario es estático, así que no depende de las DLL de MinGW ni de la versión de glibc del equipo; en macOS requiere macOS 11 o superior:

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
> En el paquete npm el motor está en `bin/<plataforma>/` y el grafo en `bin/grafos/`; el motor también busca ahí (`../grafos/`), por lo que no hace falta `--grafo`.

| Opción | Descripción |
| :--- | :--- |
| `--array lat lon ...` | Coordenadas en pares. Un número impar de valores es un error. |
| `--puntos <archivo o JSON>` | Ruta a un archivo JSON o un string JSON con `[[lat, lon], ...]`. Con `--puntos -` los puntos se leen de stdin, sin límite de cantidad (es lo que usa `calcularRuta()`). |
| `--grafo <ruta>` | Grafo `.bin` (o `.json`). Por defecto `grafo_mazatan_villapesqueira.bin`; se busca en el directorio actual, junto al ejecutable y en `grafos/`. |
| `--salida <archivo>` | Guarda el resultado en un archivo en lugar de imprimirlo. |
| `--stdout` | Imprime `{"resultado": ..., "cache": ...}` (formato que usa `calcularRuta()`). Sin esta opción se imprime solo el resultado. |
| `--cache <archivo>` | Archivo de caché de tramos a leer y guardar. Por defecto `cache_rutas.json` en el directorio actual. |
| `--no-save-cache` | Lee el caché pero no lo guarda. |
| `--sin-cache` | No lee ni escribe ningún archivo de caché. |
| `--optimizar` | Reordena las paradas para minimizar la distancia (la primera es el inicio). Ver la sección 8. |
| `--regresar` | Termina la ruta en el punto de inicio (con o sin `--optimizar`). |
| `--fijar-final` | Con `--optimizar`, mantiene la última parada al final. No se combina con `--regresar`. |
| `--serve` | Modo servidor: carga el grafo una vez y atiende peticiones JSON por stdin, una por línea (ver abajo). El caché se guarda al cerrarse stdin. |

Cualquier otra opción es un error (código 2), para que una opción mal escrita no pase inadvertida.

**Protocolo del modo servidor** (una línea JSON por petición y por respuesta):

```text
→ {"id": 1, "puntos": [[lat, lon], ...], "optimizar": false, "regresar": false, "fijar_final": false}
← {"id": 1, "ok": true, "resultado": {...}}
← {"id": 1, "ok": false, "codigo": "SIN_RUTA", "error": "No se encontro ruta entre ..."}
```

Un error en una petición no detiene el servidor; las demás se siguen atendiendo.

**Rutas de archivo**: se aceptan rutas con acentos y caracteres no ASCII en todas las opciones (por ejemplo `C:\Users\José Muñoz\...`). En Windows los argumentos se leen en Unicode (`GetCommandLineW`) y se manejan internamente en UTF-8.

**Caché**: cada tramo guardado se valida contra el grafo cargado (nodos existentes y conectados, extremos correctos). Si el grafo se regeneró y un tramo ya no es válido, se descarta, se recalcula y se corrige en el archivo.

**Códigos de salida** (el detalle se escribe en stderr como `Error: ...`; en el modo servidor va en el campo `codigo`):

| Código | `codigo` en `--serve` | Cuándo |
| :---: | :--- | :--- |
| 0 | — | La ruta se calculó |
| 1 | `INTERNO` | Error inesperado |
| 2 | `ENTRADA_INVALIDA` | Opción desconocida o sin valor, puntos inválidos, opciones incompatibles |
| 3 | `GRAFO_INVALIDO` | El grafo no existe o el archivo es inválido (truncado, corrupto) |
| 4 | `SIN_RUTA` | Algún tramo entre paradas no tiene camino posible |

---

## 8. Optimización del Orden de las Paradas

Con `--optimizar` el motor elige en qué orden visitar las paradas para recorrer la menor distancia. En [`optimizar.hpp`](https://github.com/Mahynlo/RutaCraftOSM/blob/main/RutaCraftOSM_c/include/optimizar.hpp):

1. **Matriz de distancias por la red**: un Dijkstra desde cada parada que se detiene al alcanzar todas las demás. Son distancias reales por calle (no en línea recta) y, en un grafo que respeta sentidos, pueden ser asimétricas (A→B ≠ B→A).
2. **Búsqueda del orden**, con la primera parada fija como inicio:
   * Hasta **8 paradas libres**: se prueban todas las permutaciones (8! = 40,320) y el resultado es el **óptimo exacto**.
   * Más paradas: **vecino más cercano** como solución inicial y mejoras locales **2-opt** (invertir un tramo) y **Or-opt** (mover una parada), con el cambio de costo calculado en O(1) mediante sumas acumuladas en ambos sentidos. La mejora se aplica también al orden recibido y se elige el mejor resultado, así que nunca empeora una ruta que ya venía bien ordenada.
3. **Modos**: abierto (termina en cualquier parada), `--regresar` (vuelve al inicio) o `--fijar-final` (la última parada queda al final).

El resultado agrega dos campos:

```json
"orden": [0, 8, 7, 14, 2, ...],
"optimizacion": {"distancia_original_m": 32019.0, "distancia_optimizada_m": 10721.3, "metodo": "heuristico"}
```

`puntos_gps` queda en el orden de visita y `orden[i]` es el índice en la entrada de `puntos_gps[i]`. Con `--regresar` el último elemento de `orden` es `0`. En los escenarios del benchmark, rutas de 25 y 50 paradas desordenadas bajan entre 63% y 74% ([5. Rendimiento](./5_RENDIMIENTO.md#4-optimización-del-orden-de-las-paradas)).
