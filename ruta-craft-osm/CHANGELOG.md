# Cambios de ruta-craft-osm

## 0.2.0

### Nuevo
- **Navegador (WebAssembly)**: `ruta-craft-osm/web` con `crearMotorWeb()` (motor en un Web Worker) y `cargarMotorWasm()` (síncrono). Es el mismo motor C++ compilado con Emscripten y da exactamente las mismas respuestas que el nativo.
- **Generador de grafos en TypeScript** (reemplaza a los scripts de Python con OSMnx): `generarGrafo()` en Node y en el navegador, y la CLI `npx ruta-craft-osm generar | info | reordenar`. Produce el mismo grafo que OSMnx (mismos nodos, aristas y distancias). Las calles sin nombre usan su referencia (p. ej. `MEX 15`).
- `ruta-craft-osm/generador` y los tipos compartidos se exportan también como módulos ES.
- **Releases en GitHub**: cada versión publica el CLI para Windows, Linux y macOS (con el grafo de ejemplo), el paquete npm multiplataforma y el módulo WebAssembly, con sumas SHA-256. `cli --version` muestra la versión del motor.

### Rendimiento
- Optimizar el orden de muchas paradas es mucho más rápido: la matriz de distancias se calcula en varios hilos y sus caminos se reutilizan como tramos de la ruta (50 paradas en Hermosillo: ~1.3 s → ~0.12 s).
- A\* usa una proyección plana precalculada para la heurística (sin trigonometría por nodo): 20–30% más rápido.
- El grafo incluido tiene los nodos ordenados por la curva de Hilbert (mejor uso de la caché del procesador): otro 15–30% en A\*. Las distancias no cambian. Los grafos existentes se pueden reordenar con `ruta-craft-osm reordenar`.

### Cambios
- En el modo servidor, un campo booleano con otro tipo (p. ej. `"optimizar": "si"`) se rechaza como `ENTRADA_INVALIDA` (antes `INTERNO`).
- El grafo incluido se regeneró con el nuevo generador: mismos nodos, aristas y distancias; cambian el orden interno de los nodos y dos nombres de vía tomados de su referencia. Los cachés de tramos existentes siguen siendo válidos (usan OSM IDs).

## 0.1.0

### Nuevo
- **Motor persistente** `crearMotorRutas()`: mantiene el grafo cargado y calcula cada ruta en menos de 1 ms (zona Mazatán) o ~2-3 ms (ciudad de Hermosillo), frente a ~30-60 ms por llamada con `calcularRuta()`.
- **Optimización del orden de las paradas**: opciones `optimizar`, `regresarAlInicio` y `fijarFinal` en `calcularRuta()` y `motor.calcular(puntos, opciones)`. El resultado incluye `orden` y `optimizacion` (distancia original y optimizada, método exacto o heurístico). En rutas de prueba con paradas desordenadas la distancia baja entre 65% y 73%.
- **Errores tipados**: todos los rechazos son `ErrorRutaCraft` con un `codigo` estable (`ENTRADA_INVALIDA`, `GRAFO_INVALIDO`, `SIN_RUTA`, `TIMEOUT`, `PLATAFORMA_NO_SOPORTADA`, `MOTOR_NO_DISPONIBLE`, `INTERNO`).
- **Multiplataforma**: binarios por plataforma en `bin/<plataforma>/` (`win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`); `plataformaActual()`, `PLATAFORMAS_SOPORTADAS` y `GRAFO_INCLUIDO`.
- Opción `timeoutMs` (por defecto 30 s).

### Corregido
- La distancia total no incluía el primer tramo de la ruta.
- Un tramo sin camino posible devolvía una línea recta; ahora la promesa se rechaza (`SIN_RUTA`).
- El motor fallaba si la ruta del programa, del grafo o del caché tenía acentos o "ñ" (p. ej. usuario de Windows "José").
- Un caché generado con otro grafo producía rutas falsas; ahora cada tramo se valida y se recalcula si no es válido.
- `calcularRuta()` fallaba con más de ~1,300 puntos (límite de la línea de comandos de Windows); los puntos ahora viajan por stdin.
- Escribir a un motor que ya había terminado tumbaba el proceso de Node/Electron (EPIPE).
- Nombres de calle con acentos podían llegar dañados al partirse la salida en fragmentos.
- Se podía mostrar una ventana de consola al calcular en Windows (`windowsHide`).
- La heurística del A\* podía sobrestimar distancias (hasta 0.11%); ahora es admisible y garantiza la ruta más corta.

### Cambiado
- **Instrucciones** agrupadas por calle: entre 40% y 50% menos instrucciones, sin tramos de menos de 15 m, y nuevas acciones `"Gira ligeramente a la ..."`, `"Gira bruscamente a la ..."` y `"Da vuelta en U"`.
- Sin `cachePath`, ya no se lee ni escribe `cache_rutas.json` en el directorio de trabajo.
- Grafo en formato `RCO2`: un tercio del tamaño, carga unas 20 veces más rápida y la mitad de memoria. El motor sigue aceptando `RCO1`.
- Los mensajes de error del motor ya no llevan el prefijo `Error(py):`.
- `calcularRuta()` ya no acepta una opción `cache` (nunca tuvo efecto); usa `cachePath`.

## 0.0.7

Versión inicial del wrapper sobre el motor anterior (Python empaquetado con Nuitka).
