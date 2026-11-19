# ⏱️ 5. Rendimiento del Motor C++

> [!NOTE]
> Página generada automáticamente por `RutaCraftOSM_c/bench/correr_benchmark.mjs`; no editar a mano.
> Medido el **2026-11-19** en **AMD Ryzen 7 3750H with Radeon Vega Mobile Gfx** (Windows 10.0.26300). Los tiempos son la mediana de 5 repeticiones.

Se mide el motor tal como lo usan la aplicación de Electron (nativo) y el navegador (WebAssembly), en dos grafos:

* **Mazatán - Villa Pesqueira**: el grafo de producción, zona rural.
* **Ciudad de Hermosillo**: zona urbana con muchas calles, para ver cómo escala el motor (se genera con `ruta-craft-osm generar`, ver el encabezado de `correr_benchmark.mjs`).

---

## 1. Arranque del motor

Lo que se paga cada vez que se inicia el motor: con `calcularRuta()` en cada llamada; con el motor persistente (`crearMotorRutas()`) o con `crearMotorWeb()`, una sola vez.

| Grafo | Nodos | Aristas | Archivo | Carga del grafo | KD-Tree | Memoria pico | WASM: módulo + grafo |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mazatán - Villa Pesqueira | 24,465 | 49,556 | 1.3 MB | 2.8 ms | 3.3 ms | 8.2 MB | 31.3 ms |
| Ciudad de Hermosillo | 74,839 | 177,664 | 4.3 MB | 9.4 ms | 14.8 ms | 19.9 MB | 30.7 ms |
| Ciudad de Hermosillo (respetando sentidos) | 74,839 | 150,958 | 4 MB | 10.6 ms | 14.7 ms | 19.6 MB | 31.8 ms |

---

## 2. Tiempo por ruta

* **Nativo (persistente)**: `motor.calcular()` con el grafo ya cargado (snapping + A\* + instrucciones + JSON), sin caché.
* **WASM**: lo mismo con el motor WebAssembly (`cargarMotorWasm()` / `crearMotorWeb()`), medido en Node.
* **calcularRuta()**: tiempo real del proceso completo (arrancar el ejecutable, cargar el grafo y calcular).
* **A\***: parte del tiempo nativo que corresponde solo a la búsqueda de caminos.

Las paradas de los escenarios de 25 y 50 puntos en Hermosillo son aleatorias (semilla fija) y se visitan en ese orden, sin optimizar; por eso sus distancias son mayores que las de una ruta real.

### Mazatán - Villa Pesqueira

| Escenario | Paradas | Distancia | Nativo (persistente) | WASM | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ruta corta (3 paradas) | 3 | 0.57 km | **0.052 ms** | 0.386 ms | 30.4 ms | 0.002 ms |
| Ruta municipal (23 paradas) | 23 | 14.71 km | **0.766 ms** | 3.229 ms | 28.8 ms | 0.142 ms |

### Ciudad de Hermosillo

| Escenario | Paradas | Distancia | Nativo (persistente) | WASM | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 14.9 km | **3.083 ms** | 4.311 ms | 48.6 ms | 2.679 ms |
| Centro al aeropuerto (2 puntos) | 2 | 10.47 km | **1.639 ms** | 2.852 ms | 47.1 ms | 1.43 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 32.02 km | **1.962 ms** | 3.45 ms | 48.6 ms | 0.631 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 441.34 km | **71.591 ms** | 83.421 ms | 121 ms | 50.994 ms |

### Ciudad de Hermosillo (respetando sentidos)

| Escenario | Paradas | Distancia | Nativo (persistente) | WASM | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 15.03 km | **2.743 ms** | 3.75 ms | 49 ms | 2.115 ms |
| Centro al aeropuerto (2 puntos) | 2 | 11.04 km | **1.37 ms** | 2.324 ms | 47.8 ms | 0.933 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 35.9 km | **2.169 ms** | 3.463 ms | 53 ms | 0.559 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 459.4 km | **63.682 ms** | 78.809 ms | 116.5 ms | 48.724 ms |

---

## 3. Instrucciones de navegación

| Grafo | Escenario | Instrucciones | Recto / Der. / Izq. | Metros por instrucción | Distancia sin nombre de calle |
| :--- | :--- | ---: | :---: | ---: | ---: |
| Mazatán - Villa Pesqueira | Ruta corta (3 paradas) | 3 | 1 / 1 / 1 | 191.2 m | 100% |
| Mazatán - Villa Pesqueira | Ruta municipal (23 paradas) | 26 | 7 / 9 / 10 | 565.6 m | 22.9% |
| Ciudad de Hermosillo | Cruce norte-sur (2 puntos) | 21 | 7 / 7 / 7 | 709.3 m | 0.2% |
| Ciudad de Hermosillo | Centro al aeropuerto (2 puntos) | 19 | 7 / 5 / 7 | 551.1 m | 2.9% |
| Ciudad de Hermosillo | Ruta de lectura en una colonia (25 paradas) | 155 | 25 / 43 / 87 | 206.6 m | 4.8% |
| Ciudad de Hermosillo | Recorrido por toda la ciudad (50 paradas) | 862 | 170 / 249 / 443 | 512 m | 13.5% |
| Ciudad de Hermosillo (respetando sentidos) | Cruce norte-sur (2 puntos) | 21 | 6 / 8 / 7 | 715.9 m | 0.3% |
| Ciudad de Hermosillo (respetando sentidos) | Centro al aeropuerto (2 puntos) | 19 | 7 / 6 / 6 | 581 m | 12.2% |
| Ciudad de Hermosillo (respetando sentidos) | Ruta de lectura en una colonia (25 paradas) | 159 | 19 / 55 / 85 | 225.8 m | 1.7% |
| Ciudad de Hermosillo (respetando sentidos) | Recorrido por toda la ciudad (50 paradas) | 838 | 169 / 248 / 421 | 548.2 m | 14.8% |

Primeras instrucciones de *Cruce norte-sur (2 puntos)* (Hermosillo):

```text
Sigue recto en Margarita Maza de Juárez (1409 m)
Gira ligeramente a la izquierda en Boulevard Lázaro Cárdenas (798 m)
Gira a la derecha en Boulevard Olivares (2895 m)
Sigue recto en Olivares (2182 m)
Gira ligeramente a la derecha en desconocida (33 m)
Gira a la izquierda en Doctor Paliza (26 m)
```

---

## 4. Optimización del orden de las paradas

Las mismas paradas, en el orden recibido y con `--optimizar` (`optimizar: true` en el wrapper). La primera parada se mantiene como inicio. El tiempo incluye la matriz de distancias por la red entre todas las paradas, que el motor nativo reparte entre varios hilos (WebAssembly usa uno).

| Grafo | Escenario | Paradas | Orden recibido | Optimizado | Ahorro | Método | calcularRuta() | WASM |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- | ---: | ---: |
| Mazatán - Villa Pesqueira | Ruta municipal (23 paradas) | 23 | 14.71 km | **14.68 km** | 0% | heuristico | 35.4 ms | 12.648 ms |
| Ciudad de Hermosillo | Ruta de lectura en una colonia (25 paradas) | 25 | 32.02 km | **10.72 km** | 67% | heuristico | 52.2 ms | 14.634 ms |
| Ciudad de Hermosillo | Recorrido por toda la ciudad (50 paradas) | 50 | 441.34 km | **116.96 km** | 73% | heuristico | 120.3 ms | 507.744 ms |
| Ciudad de Hermosillo (respetando sentidos) | Ruta de lectura en una colonia (25 paradas) | 25 | 35.9 km | **13.16 km** | 63% | heuristico | 51.4 ms | 15.982 ms |
| Ciudad de Hermosillo (respetando sentidos) | Recorrido por toda la ciudad (50 paradas) | 50 | 459.4 km | **118.23 km** | 74% | heuristico | 121.3 ms | 492.061 ms |

---

## 5. Calles de un solo sentido

El grafo de producción agrega cada arista también en sentido contrario, por lo que el motor puede trazar rutas en contrasentido. Comparación en Hermosillo con un grafo que respeta los sentidos (`ruta-craft-osm generar --respetar-sentido`):

* Archivo: 4.3 MB → 4 MB; carga: 9.4 ms → 10.6 ms; aristas: 177,664 → 150,958.

| Escenario | Ignorando sentidos | Respetando sentidos | Diferencia |
| :--- | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 14.9 km | 15.03 km | +0.9% |
| Centro al aeropuerto (2 puntos) | 10.47 km | 11.04 km | +5.4% |
| Ruta de lectura en una colonia (25 paradas) | 32.02 km | 35.9 km | +12.1% |
| Recorrido por toda la ciudad (50 paradas) | 441.34 km | 459.4 km | +4.1% |
