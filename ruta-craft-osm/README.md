# ruta-craft-osm

Cálculo de rutas multi-parada **offline** sobre grafos viales de OpenStreetMap para Node.js y Electron. El cálculo lo hace un motor nativo en C++ (A\*, KD-Tree) incluido en el paquete; no requiere conexión ni servicios externos.

- Ruta por calles, distancia e instrucciones giro a giro (`"Gira a la derecha en Calle Morelos"`).
- Optimización del orden de las paradas (visitar todas recorriendo lo menos posible).
- Motor persistente para Electron: menos de 1 ms por ruta con el grafo ya cargado.
- Windows x64, Linux x64 y macOS (Intel y Apple Silicon).

## Instalación

```powershell
npm install ruta-craft-osm-0.1.0.tgz   # o "ruta-craft-osm": "file:ruta/al/paquete.tgz" en package.json
```

Requiere Node.js 18 o superior.

## Uso

### Una ruta

```javascript
const { calcularRuta } = require('ruta-craft-osm');

const { resultado } = await calcularRuta({
  puntos: [
    [29.065639, -110.056448],  // inicio
    [29.062039, -110.059091],
    [29.059486, -110.053973]
  ]
});

console.log(resultado.distancia_total_km, 'km');
for (const paso of resultado.instrucciones) {
  console.log(`${paso.accion} en ${paso.calle} (${paso.distancia_m} m)`);
}
```

### Motor persistente (recomendado en Electron)

Carga el grafo una sola vez y atiende cada ruta en milisegundos. Créalo en el proceso *main*:

```javascript
const { app, ipcMain } = require('electron');
const path = require('path');
const { crearMotorRutas } = require('ruta-craft-osm');

const motor = crearMotorRutas({
  cachePath: path.join(app.getPath('userData'), 'cache_rutas.json')
});

ipcMain.handle('calcular-ruta', (_evento, puntos) => motor.calcular(puntos));
app.on('before-quit', () => motor.cerrar());  // guarda el caché
```

### Optimizar el orden de las paradas

```javascript
const ruta = await motor.calcular(puntos, { optimizar: true, regresarAlInicio: true });

ruta.orden;          // índices de `puntos` en el orden de visita, p. ej. [0, 3, 1, 2, 0]
ruta.optimizacion;   // { distancia_original_m, distancia_optimizada_m, metodo: "exacto" | "heuristico" }
```

La primera parada siempre es el inicio. `regresarAlInicio` termina donde se empezó; `fijarFinal` mantiene la última parada al final (no se pueden combinar). Con hasta 9 paradas el orden es el óptimo exacto; con más se usa una heurística (vecino más cercano + 2-opt + Or-opt).

### Errores

Todas las promesas se rechazan con `ErrorRutaCraft`, que trae un `codigo` estable:

| `codigo` | Cuándo |
| :--- | :--- |
| `ENTRADA_INVALIDA` | Puntos fuera de rango, no numéricos u opciones incompatibles |
| `GRAFO_INVALIDO` | El grafo no existe o el archivo está dañado |
| `SIN_RUTA` | Algún tramo entre paradas no tiene camino posible |
| `TIMEOUT` | Se superó `timeoutMs` (por defecto 30 s) |
| `PLATAFORMA_NO_SOPORTADA` | El paquete no incluye el motor para este sistema |
| `MOTOR_NO_DISPONIBLE` | El motor no pudo ejecutarse o terminó inesperadamente |
| `INTERNO` | Error inesperado del motor |

```javascript
const { ErrorRutaCraft } = require('ruta-craft-osm');

try {
  await motor.calcular(puntos);
} catch (e) {
  if (e instanceof ErrorRutaCraft && e.codigo === 'SIN_RUTA') {
    // mostrar "no hay camino entre estas paradas"
  }
}
```

## Opciones

| Opción | `calcularRuta()` | `crearMotorRutas()` | Descripción |
| :--- | :---: | :---: | :--- |
| `puntos` | ✔ | (en `calcular`) | `[lat, lon][]` |
| `grafo` | ✔ | ✔ | Grafo `.bin` propio. Por defecto, el incluido (`GRAFO_INCLUIDO`). |
| `cachePath` | ✔ | ✔ | Archivo del caché de tramos. Sin él no se escribe ningún archivo. |
| `saveCache` | ✔ | ✔ | `false` para leer el caché sin guardarlo. |
| `timeoutMs` | ✔ | ✔ | Tiempo máximo por cálculo (por defecto 30000). |
| `optimizar`, `regresarAlInicio`, `fijarFinal` | ✔ | (en `calcular`) | Orden de las paradas. |

## Empaquetado con Electron

Los ejecutables no pueden correr dentro de `app.asar`; el paquete usa automáticamente `app.asar.unpacked`. electron-builder desempaqueta el módulo al detectar el ejecutable; para no depender de esa detección:

```yaml
asarUnpack:
  - node_modules/ruta-craft-osm/bin/**
```

## Más información

Documentación completa, formato del grafo, rendimiento medido y referencia de la CLI: [github.com/Mahynlo/RutaCraftOSM](https://github.com/Mahynlo/RutaCraftOSM).
