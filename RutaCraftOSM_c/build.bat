@echo off
echo Compilando RutaCraftOSM en C++ con g++ (Optimizacion O3, C++20, binario estatico)...
g++ -O3 -std=c++20 -static -Iinclude src/main.cpp -o bin/cli.exe
if %ERRORLEVEL% EQU 0 (
    echo Compilacion exitosa: bin/cli.exe generado correctamente con C++20.
) else (
    echo Error durante la compilacion.
)
