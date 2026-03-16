# cli.py (modificado para control de guardado de cache)
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
        print(f"Error(py): Error al cargar puntos GPS: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Calcular ruta entre puntos GPS usando lista de adyacencia")
    parser.add_argument('--grafo', default="grafo_mazatan_villapesqueira.pkl", help="Archivo .pkl con grafo de adyacencia")
    parser.add_argument('--puntos', help="Ruta a un archivo JSON con puntos GPS o string JSON")
    parser.add_argument('--array', nargs='+', type=float, help="Lista de lat lon intercalados. Ej: lat1 lon1 lat2 lon2 ...")
    parser.add_argument('--salida', help="Ruta del archivo JSON de salida para el resultado")
    parser.add_argument('--cache', default="cache_rutas.pkl", help="Archivo pickle/json para cache, o un string JSON directo")
    parser.add_argument('--cache-formato', default="pkl", choices=["pkl", "json"], help="Formato del cache por defecto")
    parser.add_argument('--stdout', action='store_true', help="Imprimir resultado y cache en formato JSON a la consola")
    parser.add_argument('--no-save-cache', action='store_true', help="Evita que el cache actualizado se guarde en un archivo")

    args = parser.parse_args()

    # --- Cargar puntos GPS ---
    if args.array:
        if len(args.array) % 2 != 0:
            print("Error(py): cantidad impar de coordenadas en --array")
            sys.exit(1)
        puntos_gps = [(args.array[i], args.array[i + 1]) for i in range(0, len(args.array), 2)]
    elif args.puntos:
        try:
            if os.path.isfile(args.puntos):
                puntos_gps = cargar_puntos(args.puntos)
            else:
                puntos_gps = json.loads(args.puntos)
        except Exception as e:
            print(f"Error(py): Error al interpretar puntos: {e}")
            sys.exit(1)
    else:
        print("Error(py): debes proporcionar los puntos GPS con --array o --puntos")
        sys.exit(1)

    # --- Cargar grafo y cache ---
    adj_list, coords = cargar_lista_adyacencia(args.grafo)
    
    try:
        cache = cargar_cache(args.cache, args.cache_formato)
        print("Success(py): Cache cargado correctamente.")
    except Exception as e:
        print(f"Error(py): Error al cargar cache: {e}")
        cache = {}

    # --- Calcular ruta ---
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
    
    # --- Guardar cache (solo si no es un JSON string directo) ---
    if not args.no_save_cache:
        try:
            # Verificar si args.cache es un JSON string
            json.loads(args.cache)
            print("Info(py): Cache era un JSON directo, no se guarda en archivo.")
        except json.JSONDecodeError:
            # No es JSON, es una ruta de archivo
            guardar_cache(cache, args.cache, args.cache_formato)
            print(f"Success(py): Cache guardado en {os.path.abspath(args.cache)}")
    else:
        print("Info(py): El guardado de cache en archivo fue omitido por el usuario.")

    # --- Salida de resultados ---
    if args.salida:
        try:
            with open(args.salida, 'w', encoding='utf-8') as f:
                json.dump(resultado, f, indent=2, ensure_ascii=False)
            print(f"Success(py): Resultado guardado en {args.salida}")
        except Exception as e:
            print(f"Error(py): Error al guardar resultado en archivo: {e}")

    if args.stdout:
        cache_for_json = {str(k): v for k, v in cache.items()}
        
        full_output = {
            "resultado": resultado,
            "cache": cache_for_json
        }
        print(json.dumps(full_output, indent=2, ensure_ascii=False))
        
    elif not args.salida:
        print(json.dumps(resultado, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()


