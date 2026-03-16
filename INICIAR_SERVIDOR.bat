@echo off
title Escarcha Grooming — Servidor Local
color 0A
echo.
echo  ==========================================
echo   ESCARCHA GROOMING — Servidor iniciando...
echo  ==========================================
echo.
echo  Abre tu navegador en:
echo  http://localhost:3001
echo.
echo  Panel de administracion:
echo  http://localhost:3001/admin.html
echo.
echo  Contrasena admin: escarcha2025
echo.
echo  (No cierres esta ventana mientras uses la web localmente)
echo  (Para parar el servidor cierra esta ventana negra)
echo  ==========================================
echo.
cd /d "%~dp0"
node server.js
pause
