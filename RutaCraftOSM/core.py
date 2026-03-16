import pickle
import os
import sys
import heapq 
import json
from math import radians, cos, sin, asin, sqrt, atan2, degrees

# =========================
# | FUNCIONES UTILITARIAS |
# =========================

def haversine(coord1, coord2): # Calcula la distancia entre dos coordenadas GPS
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    R = 6371000  # Radio de la Tierra en metros
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2)**2
    return R * 2 * asin(sqrt(a))

def angulo(a, b):
    return degrees(atan2(b[1] - a[1], b[0] - a[0]))

def buscar_nodo_mas_cercano(coords, lat, lon):
    """Busca el nodo más cercano a una coordenada GPS"""
    return min(coords, key=lambda n: haversine((lat, lon), coords[n]))

# =========================
# | CARGA DE DATOS        |
# =========================

def cargar_lista_adyacencia(path="grafos/grafo_mazatan_villapesqueira.pkl"):
    if getattr(sys, 'frozen', False):
        # Ejecutable empaquetado (por Nuitka, PyInstaller, etc.)
        base_path = os.path.dirname(sys.executable)
    else:
        # Modo normal (fuente .py)
        base_path = os.path.join(os.path.dirname(__file__), "grafos")

    path_real = os.path.join(base_path, path)

    if not os.path.exists(path_real):
        #print(f"❌ Error: El archivo '{path_real}' no existe.")
        print(f"Error(py): El archivo '{path_real}' no existe.")
        return {}, {}

    #print(f"🔄 Cargando lista de adyacencia desde '{path_real}'...")
    print(f"Success(py): Cargando lista de adyacencia desde: {path_real}")
    with open(path_real, "rb") as f:
        return pickle.load(f)

# =========================
# | CARGA Y GUARDADO CACHE |
# =========================

DEFAULT_FILENAME_PKL = "cache_rutas.pkl"
DEFAULT_FILENAME_JSON = "cache_rutas.json"
DEFAULT_DIR = "cache_rutas"

def cargar_cache(path=None, formato="pkl"):
    """
    Carga el caché desde un archivo o string JSON.
    
    Args:
        path: Ruta del archivo, directorio, o string JSON directo
        formato: "pkl" para pickle o "json" para JSON
    """
    # Si path es None, usar archivo por defecto
    if path is None:
        default_filename = DEFAULT_FILENAME_PKL if formato == "pkl" else DEFAULT_FILENAME_JSON
        path_real = os.path.join(DEFAULT_DIR, default_filename)
        
        if os.path.exists(path_real):
            if formato == "pkl":
                with open(path_real, "rb") as f:
                    return pickle.load(f)
            else:
                with open(path_real, "r", encoding="utf-8") as f:
                    return json.load(f)
        else:
            return {}
    
    # Intentar interpretar como JSON string directo
    try:
        cache_data = json.loads(path)
        # Convertir claves string de tuplas a tuplas reales
        cache_convertido = {}
        for key, value in cache_data.items():
            try:
                # Intentar convertir "(123, 456)" a (123, 456)
                if key.startswith('(') and key.endswith(')'):
                    parts = key.strip('()').split(',')
                    if len(parts) == 2:
                        converted_key = (int(parts[0].strip()), int(parts[1].strip()))
                        cache_convertido[converted_key] = value
                    else:
                        cache_convertido[key] = value
                else:
                    cache_convertido[key] = value
            except (ValueError, IndexError):
                cache_convertido[key] = value
        return cache_convertido
    except json.JSONDecodeError:
        # No es un JSON válido, tratar como ruta de archivo
        pass
    
    # Determinar el nombre de archivo por defecto según el formato
    default_filename = DEFAULT_FILENAME_PKL if formato == "pkl" else DEFAULT_FILENAME_JSON
    
    if os.path.isdir(path):
        # Si es una carpeta, buscar dentro de ella
        path_real = os.path.join(path, default_filename)
    elif path.endswith((".pkl", ".json")):
        # Si es un archivo con extensión válida, usamos la ruta tal cual
        path_real = path
        # Detectar formato automáticamente según la extensión
        formato = "pkl" if path.endswith(".pkl") else "json"
    else:
        # Si es solo un nombre, lo metemos en la carpeta por defecto
        path_real = os.path.join(DEFAULT_DIR, path)

    if os.path.exists(path_real):
        if formato == "pkl":
            with open(path_real, "rb") as f:
                return pickle.load(f)
        else:  # formato == "json"
            with open(path_real, "r", encoding="utf-8") as f:
                return json.load(f)
    else:
        return {}

def guardar_cache(cache, path=None, formato="pkl"):
    """
    Guarda el caché en un archivo.
    
    Args:
        cache: Diccionario con los datos del caché
        path: Ruta del archivo o directorio
        formato: "pkl" para pickle o "json" para JSON
    """
    # Determinar el nombre de archivo por defecto según el formato
    default_filename = DEFAULT_FILENAME_PKL if formato == "pkl" else DEFAULT_FILENAME_JSON
    
    if path is None:
        path_real = os.path.join(DEFAULT_DIR, default_filename)
    elif os.path.isdir(path):
        path_real = os.path.join(path, default_filename)
    elif path.endswith((".pkl", ".json")):
        path_real = path
        # Detectar formato automáticamente según la extensión
        formato = "pkl" if path.endswith(".pkl") else "json"
    else:
        path_real = os.path.join(DEFAULT_DIR, path)

    # Asegurar que la carpeta de destino existe
    directorio_destino = os.path.dirname(path_real)
    if directorio_destino:
        os.makedirs(directorio_destino, exist_ok=True)

    if formato == "pkl":
        with open(path_real, "wb") as f:
            pickle.dump(cache, f)
    else:  # formato == "json"
        with open(path_real, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)

# =========================
# | A* CON CACHÉ          |
# =========================

def astar_lista_adyacencia(adj_list, coords, origen, destino, cache):
    clave = (origen, destino)
    if clave in cache:
        return cache[clave]

    open_set = [(0, 0, origen)] # se almacena la tupla (f_score, counter, nodo)
    came_from = {} # para reconstruir el camino
    g_score = {origen: 0} # costo desde el origen hasta el nodo actual
    counter = 1 # contador para mantener el orden de inserción en el heap

    while open_set:
        _, _, actual = heapq.heappop(open_set) 

        if actual == destino: # hemos llegado al destino
            path = [] # reconstruir el camino
            while actual in came_from: # hay un camino hacia atrás
                path.append(actual)
                actual = came_from[actual]
            path.append(origen)
            ruta = path[::-1]
            cache[clave] = ruta
            return ruta

        for vecino, peso in adj_list.get(actual, []):
            tentative_g = g_score[actual] + peso
            if tentative_g < g_score.get(vecino, float("inf")):
                came_from[vecino] = actual
                g_score[vecino] = tentative_g
                f_score = tentative_g + haversine(coords[vecino], coords[destino])
                heapq.heappush(open_set, (f_score, counter, vecino))
                counter += 1

    return []

# =========================
# | CONSTRUCCIÓN DE RUTA  |
# =========================

def construir_ruta_con_lista(adj_list, coords, puntos_gps, cache, max_dist=10):
    conexiones_verdes = []
    ruta_nodos = []
    nodos = []

    for lat, lon in puntos_gps:
        nodo_cercano = buscar_nodo_mas_cercano(coords, lat, lon)
        coord = coords[nodo_cercano]
        if haversine(coord, (lat, lon)) > max_dist:
            conexiones_verdes.append((coord, (lat, lon)))
        nodos.append(nodo_cercano)

    for i in range(1, len(nodos)):
        segmento = astar_lista_adyacencia(adj_list, coords, nodos[i - 1], nodos[i], cache)
        if not segmento:
            #print(f"❌ No se encontró ruta entre {nodos[i - 1]} y {nodos[i]}")
            print(f"Error(py): No se encontró ruta entre {nodos[i - 1]} y {nodos[i]}")
        ruta_nodos.extend(segmento if i == 1 else segmento[1:])

    return ruta_nodos, conexiones_verdes

# =========================
# | INSTRUCCIONES         |
# =========================

def calcular_instrucciones(coords, ruta_nodos):
    instrucciones = []
    distancia_total = 0
    anterior = None

    for i in range(1, len(ruta_nodos) - 1):
        u, v, w = ruta_nodos[i - 1], ruta_nodos[i], ruta_nodos[i + 1]
        coord_u, coord_v, coord_w = coords[u], coords[v], coords[w]
        dist = haversine(coord_v, coord_w)
        distancia_total += dist
        ang1 = angulo(coord_u, coord_v)
        ang2 = angulo(coord_v, coord_w)
        giro = (ang2 - ang1 + 360) % 360

        accion = ( # determinar la acción según el giro
            "Sigue recto" if giro < 30 or giro > 330
            else "Gira a la derecha" if giro < 180
            else "Gira a la izquierda"
        )

        actual = { # instrucción actual 
            "accion": accion,
            "calle": "desconocida",
            "desde": coord_v,
            "hacia": coord_w,
            "distancia_m": round(dist, 1)
        }

        if anterior and anterior["accion"] == actual["accion"] and anterior["calle"] == actual["calle"]:
            anterior["distancia_m"] += actual["distancia_m"]
            anterior["hacia"] = actual["hacia"]
        else:
            if anterior:
                instrucciones.append(anterior)
            anterior = actual

    if anterior:
        instrucciones.append(anterior)

    return instrucciones, round(distancia_total, 1)


