import pickle
import os
import heapq
from math import radians, cos, sin, asin, sqrt, atan2, degrees

# =========================
# | FUNCIONES UTILITARIAS |
# =========================

def haversine(coord1, coord2):
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

def cargar_lista_adyacencia(path="grafo_mazatan_villapesqueira.pkl"):
    """Carga archivo .pkl con (adj_list, coords)"""
    
    #se carga el grafo de la carpeta grafos/ con el nombre dado o por defecto grafo_mazatan_villapesqueira.pkl que debe estar en esa carpeta
    
    if not os.path.exists(path):
        print(f"❌ Error: El archivo '{path}' no existe. Asegúrate de haberlo generado previamente.")
        print(path)
        return {}, {}
    print(f"🔄 Cargando lista de adyacencia desde '{path}'...")
    # se carga el archivo pickle
    with open(path, "rb") as f:
        return pickle.load(f)

def cargar_cache(path="cache_rutas.pkl"):
    # se carga de la carpeta cache_rutas/ el archivo cache_rutas.pkl
    path = os.path.join("cache_rutas", path)  # ruta completa del archivo pickle
    
    return pickle.load(open(path, "rb")) if os.path.exists(path) else {}

def guardar_cache(cache, path="cache_rutas.pkl"):
    # se crea la carpeta cons el nomnre cache_rutas/ con el nombre dado o por defecto cache_rutas.pkl
    path = os.path.join("cache_rutas", path)  # ruta completa del archivo
    if not os.path.exists(os.path.dirname(path)):
        print(f"🔄 Creando carpeta para cache: {os.path.dirname(path)}")
    #si de existe la carpeta "cache_rutas", la crea
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(cache, f)

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
            print(f"❌ No se encontró ruta entre {nodos[i - 1]} y {nodos[i]}")
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


