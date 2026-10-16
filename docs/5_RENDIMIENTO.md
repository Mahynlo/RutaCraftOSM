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
| Mazatán - Villa Pesqueira | 24,465 | 98,846 | 4.1 MB | 30.0 ms | 3.7 ms | 15.5 MB |
| Ciudad de Hermosillo | 74,839 | 301,916 | 13.5 MB | 118.7 ms | 14.5 ms | 45.3 MB |
| Ciudad de Hermosillo (respetando sentidos) | 74,839 | 150,958 | 7.8 MB | 77.1 ms | 16.2 ms | 33.0 MB |

---

## 2. Tiempo por ruta

* **Motor persistente**: tiempo de `motor.calcular()` con el grafo ya cargado (snapping + A\* + instrucciones + JSON), sin caché.
* **calcularRuta()**: tiempo real del proceso completo (arrancar `cli.exe`, cargar el grafo y calcular).
* **A\***: parte del tiempo que corresponde solo a la búsqueda de caminos.

Las paradas de los escenarios de 25 y 50 puntos en Hermosillo se generan al azar (semilla fija) y se visitan en ese orden, sin optimizar; por eso sus distancias son mayores que las de una ruta real.

### Mazatán - Villa Pesqueira

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Ruta corta (3 paradas) | 3 | 0.57 km | **0.063 ms** | 60.0 ms | 0.013 ms |
| Ruta municipal (23 paradas) | 23 | 14.71 km | **0.699 ms** | 58.2 ms | 0.228 ms |

### Ciudad de Hermosillo

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 14.9 km | **5.153 ms** | 185.5 ms | 4.562 ms |
| Centro al aeropuerto (2 puntos) | 2 | 10.47 km | **2.844 ms** | 171.8 ms | 2.403 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 32.02 km | **2.268 ms** | 168.0 ms | 0.999 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 441.34 km | **124.618 ms** | 290.3 ms | 100.143 ms |

### Ciudad de Hermosillo (respetando sentidos)

| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\* |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 2 | 15.03 km | **4.944 ms** | 120.5 ms | 4.016 ms |
| Centro al aeropuerto (2 puntos) | 2 | 11.04 km | **1.791 ms** | 122.7 ms | 1.379 ms |
| Ruta de lectura en una colonia (25 paradas) | 25 | 35.9 km | **2.377 ms** | 116.6 ms | 0.933 ms |
| Recorrido por toda la ciudad (50 paradas) | 50 | 459.4 km | **109.293 ms** | 246.0 ms | 95.229 ms |

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

## 4. Calles de un solo sentido

El grafo de producción agrega cada arista también en sentido contrario, por lo que el motor puede trazar rutas en contrasentido. Comparación en Hermosillo con un grafo que respeta los sentidos (`exportar_grafo_binario(..., respetar_sentido=True)`):

* Archivo: 13.5 MB → 7.8 MB; carga: 118.7 ms → 77.1 ms; aristas: 301,916 → 150,958.

| Escenario | Ignorando sentidos | Respetando sentidos | Diferencia |
| :--- | ---: | ---: | ---: |
| Cruce norte-sur (2 puntos) | 14.9 km | 15.03 km | +0.9% |
| Centro al aeropuerto (2 puntos) | 10.47 km | 11.04 km | +5.4% |
| Ruta de lectura en una colonia (25 paradas) | 32.02 km | 35.9 km | +12.1% |
| Recorrido por toda la ciudad (50 paradas) | 441.34 km | 459.4 km | +4.1% |
