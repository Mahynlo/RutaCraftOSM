# ⏱️ 5. Rendimiento del Motor C++

> [!NOTE]
> Página generada automáticamente por `RutaCraftOSM_c/bench/correr_benchmark.py`; no editar a mano.
> Medido el **2026-10-15** en **AMD Ryzen 7 3750H with Radeon Vega Mobile Gfx** (Windows 11). Los tiempos son la mediana de 5 repeticiones.

Se mide el motor tal como lo usa la aplicación de Electron, en dos grafos:

* **Mazatán - Villa Pesqueira**: el grafo de producción, zona rural.
* **Ciudad de Hermosillo**: zona urbana con muchas calles, para ver cómo escala el motor (se genera con `RutaCraftOSM/generar_grafos_benchmark.py`).

---

## 1. Arranque del motor

Lo que se paga cada vez que se inicia `cli.exe`: una vez por llamada con `calcularRuta()`, o una sola vez con el motor persistente (`crearMotorRutas()`).

| Grafo | Nodos | Aristas | Archivo | Carga del grafo | KD-Tree | Memoria pico |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mazatán - Villa Pesqueira | 24,465 | 49,556 | 1.3 MB | 1.7 ms | 3.3 ms | 7.9 MB |
| Ciudad de Hermosillo | 74,839 | 177,664 | 4.3 MB | 5.4 ms | 13.2 ms | 19.1 MB |
| Ciudad de Hermosillo (respetando sentidos) | 74,839 | 150,958 | 4.0 MB | 6.6 ms | 14.9 ms | 18.8 MB |

---

## 2. Tiempo por ruta

* **Motor persistente**: tiempo de `motor.calcular()` con el grafo ya cargado (snapping + A\* + instrucciones + JSON), sin caché.
* **calcularRuta()**: tiempo real del proceso completo (arrancar `cli.exe`, cargar el grafo y calcular).
* **A\***: parte del tiempo que corresponde solo a la búsqueda de caminos.

Las paradas de los escenarios de 25 y 50 puntos en Hermosillo se generan al azar (semilla fija) y se visitan en ese orden, sin optimizar; por eso sus distancias son mayores que las de una ruta real.

### Mazatán - Villa Pesqueira

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Ruta corta (3 paradas) | 3 | 0.57 km | **0.046 ms** | 24.6 ms | 0.003 ms |
| Ruta municipal (23 paradas) | 23 | 14.71 km | **0.506 ms** | 25.8 ms | 0.096 ms |

### Ciudad de Hermosillo

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 14.9 km | **2.688 ms** | 46.0 ms | 2.575 ms |
| Centro al aeropuerto (2 puntos) | 2 | 10.47 km | **1.562 ms** | 41.3 ms | 1.321 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 32.02 km | **1.779 ms** | 41.3 ms | 0.565 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 441.34 km | **66.65 ms** | 114.8 ms | 50.943 ms |

### Ciudad de Hermosillo (respetando sentidos)

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 15.03 km | **2.311 ms** | 41.3 ms | 2.033 ms |
| Centro al aeropuerto (2 puntos) | 2 | 11.04 km | **1.254 ms** | 39.8 ms | 1.039 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 35.9 km | **1.908 ms** | 42.0 ms | 0.644 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 459.4 km | **64.004 ms** | 117.1 ms | 48.562 ms |

---

## 3. Instrucciones de navegación

| Grafo | Escenario | Instrucciones | Recto / Der. / Izq. | Metros por instrucción | Distancia sin nombre de calle |
| :--- | :--- | ---: | :---: | ---: | ---: |
| Mazatán - Villa Pesqueira | Ruta corta (3 paradas) | 3 | 1 / 1 / 1 | 191.2 m | 100.0% |
| Mazatán - Villa Pesqueira | Ruta municipal (23 paradas) | 24 | 5 / 9 / 10 | 612.8 m | 92.0% |
| Ciudad de Hermosillo | Cruce norte-sur (2 puntos) | 21 | 7 / 7 / 7 | 709.3 m | 0.2% |
| Ciudad de Hermosillo | Centro al aeropuerto (2 puntos) | 19 | 7 / 5 / 7 | 551.1 m | 2.9% |
| Ciudad de Hermosillo | Ruta de lectura en una colonia (25 paradas) | 155 | 25 / 43 / 87 | 206.6 m | 4.8% |
| Ciudad de Hermosillo | Recorrido por toda la ciudad (50 paradas) | 862 | 170 / 249 / 443 | 512.0 m | 13.5% |
| Ciudad de Hermosillo (respetando sentidos) | Cruce norte-sur (2 puntos) | 21 | 6 / 8 / 7 | 715.9 m | 0.3% |
| Ciudad de Hermosillo (respetando sentidos) | Centro al aeropuerto (2 puntos) | 19 | 7 / 6 / 6 | 581.0 m | 12.2% |
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

Las mismas paradas, en el orden recibido y con `--optimizar` (`optimizar: true` en el wrapper). La primera parada se mantiene como inicio. El tiempo es el de `calcularRuta()` completo, incluida la matriz de distancias por la red entre todas las paradas.

| Grafo | Escenario | Paradas | Orden recibido | Optimizado | Ahorro | Método | calcularRuta() |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- | ---: |
| Mazatán - Villa Pesqueira | Ruta municipal (23 paradas) | 23 | 14.71 km | **14.68 km** | 0% | heuristico | 34.6 ms |
| Ciudad de Hermosillo | Ruta de lectura en una colonia (25 paradas) | 25 | 32.02 km | **10.72 km** | 67% | heuristico | 51.9 ms |
| Ciudad de Hermosillo | Recorrido por toda la ciudad (50 paradas) | 50 | 441.34 km | **116.96 km** | 73% | heuristico | 536.2 ms |
| Ciudad de Hermosillo (respetando sentidos) | Ruta de lectura en una colonia (25 paradas) | 25 | 35.9 km | **13.16 km** | 63% | heuristico | 55.3 ms |
| Ciudad de Hermosillo (respetando sentidos) | Recorrido por toda la ciudad (50 paradas) | 50 | 459.4 km | **118.23 km** | 74% | heuristico | 508.8 ms |

---

## 5. Calles de un solo sentido

El grafo de producción agrega cada arista también en sentido contrario, por lo que el motor puede trazar rutas en contrasentido. Comparación en Hermosillo con un grafo que respeta los sentidos (`exportar_grafo_binario(..., respetar_sentido=True)`):

* Archivo: 4.3 MB → 4.0 MB; carga: 5.4 ms → 6.6 ms; aristas: 177,664 → 150,958.

| Escenario | Ignorando sentidos | Respetando sentidos | Diferencia |
| :--- | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 14.9 km | 15.03 km | +0.9% |
| Centro al aeropuerto (2 puntos) | 10.47 km | 11.04 km | +5.4% |
| Ruta de lectura en una colonia (25 paradas) | 32.02 km | 35.9 km | +12.1% |
| Recorrido por toda la ciudad (50 paradas) | 441.34 km | 459.4 km | +4.1% |
