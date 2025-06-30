# cli.py (modificado para usar el nuevo core basado en lista de adyacencia)
import json
import argparse
import os
import sys
from core import (
    cargar_lista_adyacencia,
    cargar_cache,
    guardar_cache,
    construir_ruta_con_lista,
    calcular_instrucciones
)

import time


def cargar_puntos(path):
    print(f">>> Puntos GPS recibidos: {path}")
    try:
        with open(path, 'r') as f:
            puntos = json.load(f)
            if isinstance(puntos, list) and all(len(p) == 2 for p in puntos):
                return puntos
            else:
                raise ValueError("Formato incorrecto: se espera una lista de [lat, lon].")
    except Exception as e:
        print(f"❌ Error al cargar puntos GPS: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Calcular ruta entre puntos GPS usando lista de adyacencia")
    parser.add_argument('--grafo', default="grafo_mazatan_villapesqueira.pkl", help="Archivo .pkl con grafo de adyacencia")
    parser.add_argument('--puntos', help="Ruta a un archivo JSON con puntos GPS o string JSON")
    parser.add_argument('--array', nargs='+', type=float, help="Lista de lat lon intercalados. Ej: lat1 lon1 lat2 lon2 ...")
    parser.add_argument('--salida', help="Ruta del archivo JSON de salida")
    parser.add_argument('--stdout', action='store_true', help="Imprimir resultado en consola")

    args = parser.parse_args()

    # Cargar puntos GPS
    if args.array:
        if len(args.array) % 2 != 0:
            print("❌ Error: cantidad impar de coordenadas en --array")
            sys.exit(1)
        puntos_gps = [(args.array[i], args.array[i + 1]) for i in range(0, len(args.array), 2)]
    elif args.puntos:
        try:
            if os.path.isfile(args.puntos):
                puntos_gps = cargar_puntos(args.puntos)
            else:
                puntos_gps = json.loads(args.puntos)
        except Exception as e:
            print(f"❌ Error al interpretar puntos: {e}")
            sys.exit(1)
    else:
        print("❌ Error: debes proporcionar los puntos GPS con --array o --puntos")
        sys.exit(1)

    # Cargar grafo y cache
    #print(f">>> Cargando grafo desde: {args.grafo}")
    adj_list, coords = cargar_lista_adyacencia(args.grafo)
    cache = cargar_cache()

    # Calcular ruta
    #print(f">>> Calculando ruta entre {len(puntos_gps)} puntos GPS")
    ruta_nodos, conexiones_verdes = construir_ruta_con_lista(adj_list, coords, puntos_gps, cache)
    ruta_coords = [coords[n] for n in ruta_nodos]
    instrucciones, distancia_total = calcular_instrucciones(coords, ruta_nodos)

    resultado = {
        "puntos_gps": puntos_gps,
        "ruta": ruta_coords,
        "distancia_total_m": distancia_total,
        "distancia_total_km": round(distancia_total / 1000, 2),
        "instrucciones": instrucciones
    }

    guardar_cache(cache)

    if args.salida:
        try:
            with open(args.salida, 'w', encoding='utf-8') as f:
                json.dump(resultado, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"❌ Error al guardar resultado en archivo: {e}")

    if args.stdout or not args.salida:
        print(json.dumps(resultado, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()



