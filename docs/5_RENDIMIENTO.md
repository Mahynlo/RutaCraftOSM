# ⏱️ 5. Rendimiento del Motor C++

> [!NOTE]
> Página generada automáticamente por `RutaCraftOSM_c/bench/correr_benchmark.py`; no editar a mano.
> Medido el **2026-10-14** en **AMD Ryzen 7 3750H with Radeon Vega Mobile Gfx** (Windows 11). Los tiempos son la mediana de 5 repeticiones.

Se mide el motor tal como lo usa la aplicación de Electron, en dos grafos:

* **Mazatán - Villa Pesqueira**: el grafo de producción, zona rural.
* **Ciudad de Hermosillo**: zona urbana con muchas calles, para ver cómo escala el motor (se genera con `RutaCraftOSM/generar_grafos_benchmark.py`).

---

## 1. Arranque del motor

Lo que se paga cada vez que se inicia `cli.exe`: una vez por llamada con `calcularRuta()`, o una sola vez con el motor persistente (`crearMotorRutas()`).

| Grafo | Nodos | Aristas | Archivo | Carga del grafo | KD-Tree | Memoria pico |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mazatán - Villa Pesqueira | 24,465 | 98,846 | 4.1 MB | 40.9 ms | 4.1 ms | 15.7 MB |
| Ciudad de Hermosillo | 74,839 | 301,916 | 13.5 MB | 120.6 ms | 15.5 ms | 46.7 MB |
| Ciudad de Hermosillo (respetando sentidos) | 74,839 | 150,958 | 7.8 MB | 59.1 ms | 13.5 ms | 34.4 MB |

---

## 2. Tiempo por ruta

* **Motor persistente**: tiempo de `motor.calcular()` con el grafo ya cargado (snapping + A\* + instrucciones + JSON), sin caché.
* **calcularRuta()**: tiempo real del proceso completo (arrancar `cli.exe`, cargar el grafo y calcular).
* **A\***: parte del tiempo que corresponde solo a la búsqueda de caminos.

Las paradas de los escenarios de 25 y 50 puntos en Hermosillo se generan al azar (semilla fija) y se visitan en ese orden, sin optimizar; por eso sus distancias son mayores que las de una ruta real.

### Mazatán - Villa Pesqueira

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Ruta corta (3 paradas) | 3 | 0.57 km | **0.096 ms** | 53.4 ms | 0.014 ms |
| Ruta municipal (23 paradas) | 23 | 14.71 km | **1.446 ms** | 58.7 ms | 0.79 ms |

### Ciudad de Hermosillo

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 14.9 km | **5.174 ms** | 147.4 ms | 4.65 ms |
| Centro al aeropuerto (2 puntos) | 2 | 10.47 km | **2.943 ms** | 148.1 ms | 2.435 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 32.02 km | **2.912 ms** | 155.0 ms | 1.071 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 441.34 km | **102.853 ms** | 249.6 ms | 91.774 ms |

### Ciudad de Hermosillo (respetando sentidos)

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 15.03 km | **4.063 ms** | 103.3 ms | 3.395 ms |
| Centro al aeropuerto (2 puntos) | 2 | 11.04 km | **2.062 ms** | 114.7 ms | 0.995 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 35.9 km | **2.688 ms** | 123.5 ms | 0.975 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 459.4 km | **93.961 ms** | 259.7 ms | 75.29 ms |

---

## 3. Instrucciones de navegación

| Grafo | Escenario | Instrucciones | Recto / Der. / Izq. | Metros por instrucción | Distancia sin nombre de calle |
| :--- | :--- | ---: | :---: | ---: | ---: |
| Mazatán - Villa Pesqueira | Ruta corta (3 paradas) | 7 | 4 / 2 / 1 | 81.9 m | 100.0% |
| Mazatán - Villa Pesqueira | Ruta municipal (23 paradas) | 48 | 22 / 13 / 13 | 306.4 m | 92.0% |
| Ciudad de Hermosillo | Cruce norte-sur (2 puntos) | 35 | 18 / 9 / 8 | 425.6 m | 0.3% |
| Ciudad de Hermosillo | Centro al aeropuerto (2 puntos) | 24 | 14 / 5 / 5 | 436.3 m | 2.9% |
| Ciudad de Hermosillo | Ruta de lectura en una colonia (25 paradas) | 261 | 129 / 58 / 74 | 122.7 m | 4.9% |
| Ciudad de Hermosillo | Recorrido por toda la ciudad (50 paradas) | 1540 | 791 / 367 / 382 | 286.6 m | 13.5% |
| Ciudad de Hermosillo (respetando sentidos) | Cruce norte-sur (2 puntos) | 37 | 19 / 11 / 7 | 406.3 m | 0.3% |
| Ciudad de Hermosillo (respetando sentidos) | Centro al aeropuerto (2 puntos) | 28 | 16 / 7 / 5 | 394.2 m | 12.2% |
| Ciudad de Hermosillo (respetando sentidos) | Ruta de lectura en una colonia (25 paradas) | 276 | 133 / 64 / 79 | 130.1 m | 1.7% |
| Ciudad de Hermosillo (respetando sentidos) | Recorrido por toda la ciudad (50 paradas) | 1473 | 763 / 350 / 360 | 311.9 m | 14.9% |

Primeras instrucciones de *Cruce norte-sur (2 puntos)* (Hermosillo):

```text
Sigue recto en Margarita Maza de Juárez (1408 m)
Gira a la izquierda en Boulevard Lázaro Cárdenas (33 m)
Sigue recto en Boulevard Lázaro Cárdenas (184 m)
Gira a la derecha en Leonardo P Gaxiola (8 m)
Gira a la izquierda en Boulevard Lázaro Cárdenas (112 m)
Sigue recto en Boulevard Lázaro Cárdenas (459 m)
```

---

## 4. Calles de un solo sentido

El grafo de producción agrega cada arista también en sentido contrario, por lo que el motor puede trazar rutas en contrasentido. Comparación en Hermosillo con un grafo que respeta los sentidos (`exportar_grafo_binario(..., respetar_sentido=True)`):

* Archivo: 13.5 MB → 7.8 MB; carga: 120.6 ms → 59.1 ms; aristas: 301,916 → 150,958.

| Escenario | Ignorando sentidos | Respetando sentidos | Diferencia |
| :--- | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 14.9 km | 15.03 km | +0.9% |
| Centro al aeropuerto (2 puntos) | 10.47 km | 11.04 km | +5.4% |
| Ruta de lectura en una colonia (25 paradas) | 32.02 km | 35.9 km | +12.1% |
| Recorrido por toda la ciudad (50 paradas) | 441.34 km | 459.4 km | +4.1% |
