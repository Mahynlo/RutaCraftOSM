#pragma once
#include <stdexcept>
#include <string>

namespace rutacraft {

// Tipos de error del motor. El valor es el código de salida de la CLI; el nombre es el que se
// envía en el modo servidor ("codigo") y el que expone el wrapper (ErrorRutaCraft.codigo).
enum class CodigoError {
    Interno = 1,          // Error inesperado
    EntradaInvalida = 2,  // Opciones o puntos inválidos
    GrafoInvalido = 3,    // El grafo no existe o el archivo es inválido
    SinRuta = 4,          // Algún tramo no tiene camino posible
};

inline const char* nombre_codigo(CodigoError codigo) {
    switch (codigo) {
        case CodigoError::EntradaInvalida: return "ENTRADA_INVALIDA";
        case CodigoError::GrafoInvalido: return "GRAFO_INVALIDO";
        case CodigoError::SinRuta: return "SIN_RUTA";
        default: return "INTERNO";
    }
}

class ErrorRuta : public std::runtime_error {
public:
    ErrorRuta(CodigoError codigo, const std::string& mensaje) : std::runtime_error(mensaje), codigo_(codigo) {}
    CodigoError codigo() const { return codigo_; }

private:
    CodigoError codigo_;
};

} // namespace rutacraft
