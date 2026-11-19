# ruta-craft-osm: motor de rutas (línea de comandos)

Calcula rutas de múltiples puntos por calles reales, sin conexión, sobre un grafo de OpenStreetMap.
Incluye el grafo de ejemplo de Mazatán y Villa Pesqueira (Sonora) en `grafos/`.

```sh
# Windows: cli.exe   ·   Linux / macOS: ./cli
cli --version

# Ruta entre coordenadas (lat lon lat lon ...), con el grafo de ejemplo
cli --array 29.065639 -110.056448 29.059486 -110.053973 --sin-cache

# Otro grafo, puntos desde un archivo JSON [[lat, lon], ...] y orden de visita optimizado
cli --grafo mi_zona.bin --puntos paradas.json --optimizar --regresar --sin-cache

# Modo servidor: una petición JSON por línea en stdin, una respuesta por línea en stdout
cli --serve --grafo mi_zona.bin
```

En macOS, si el sistema bloquea el ejecutable descargado: `xattr -d com.apple.quarantine cli`.

Para generar el grafo de otra zona: `npx ruta-craft-osm generar --geojson zona.geojson --salida mi_zona.bin`.

Referencia completa de opciones, códigos de salida y formato del resultado:
https://github.com/Mahynlo/RutaCraftOSM/blob/main/docs/3_MOTOR_CPP_RUTACRAFT.md

Licencia: el código es MIT (ver `LICENSE`). Datos de los grafos: © colaboradores de OpenStreetMap (licencia ODbL).
