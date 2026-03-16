---
description: Implementación de RGPD Avanzado Sin Dependencias (Zero-Dep GDPR)
---
# Implementación de RGPD Avanzado Sin Dependencias

Este flujo de trabajo describe cómo implementar un sistema completo de cumplimiento de protección de datos (RGPD) en un proyecto web que utiliza Vanilla JavaScript y Node.js puro, sin requerir librerías externas o servicios de gestión de banners de terceros.

## Paso 1: Bloqueo de Formulario (Frontend)
1. Inyectar un checkbox obligatorio en todos los formularios de recolección de datos (ej. reservas, contacto).
2. El contenedor del checkbox debe incluir un enlace que levante dinámicamente el Modal de Política de Privacidad (sin recargar la página).
```html
<input type="checkbox" id="chk-gdpr" required>
<label for="chk-gdpr">He leído y acepto la <a href="#privacidad" onclick="document.getElementById('modal-privacidad').classList.add('active');return false;">Política de Privacidad</a>.</label>
```
3. En el script de envío (`submit` o `fetch`), asegurar la validación extra:
```javascript
if (!document.getElementById('chk-gdpr').checked) {
  mostrarError('Debes aceptar la política de privacidad.');
  return;
}
```

## Paso 2: Trazabilidad del Consentimiento (Backend)
1. Al recibir la petición `POST` en Node.js, capturar el estado del consentimiento.
2. Generar un Timestamp (ISO 8601) en el lado del servidor como prueba auditable.
```javascript
const registro = {
  ...body,
  gdpr_aceptado: true,
  gdpr_timestamp: new Date().toISOString()
};
// Guardar el registro en la base de datos (JSON, SQL, o Mongo)
```

## Paso 3: Motor de Modales Legales (CSS/JS Puro)
1. Crear una estructura modal base oculta por defecto mediante CSS (`display: none;`).
2. Generar 3 modales distintos usando la misma clase base para:
   - Política de Privacidad
   - Política de Cookies
   - Aviso Legal
3. Inyectar enlaces en el `<footer>` que activen estos modales aplicando una clase `.active` que cambie el display a `flex`.

## Paso 4: Banner de Cookies y Configuración Avanzada (`localStorage`)
1. Crear un banner inferior fijado (`position: fixed; bottom: 0;`).
2. Dotar al banner de tres botones: "Aceptar todas", "Rechazar" y "Configurar".
3. **Módulo "Configurar":** Levantar un cuarto modal interactivo con *toggles* separados por tipo de cookie:
   - Técnicas/Necesarias (Bloqueadas en ON)
   - Analíticas (Toggle)
   - Marketing (Toggle)
4. Guardar las preferencias del usuario encapsuladas en un objeto JSON dentro de `localStorage` para persistencia local:
```javascript
function guardarPreferencias(analitica, marketing) {
  const config = { analytics: analitica, marketing: marketing };
  localStorage.setItem('cookies_accepted', JSON.stringify(config));
  // Cerrar modal y banner
}
```
5. Al cargar la web (`window.addEventListener('load')`), comprobar si existe `localStorage.getItem('cookies_accepted')`. Si no existe, mostrar el banner flotante con un pequeño `setTimeout` de 1000ms. Si existe, no mostrar el banner e inyectar condicionalmente los scripts de tracking de terceros basándose en los booleanos del JSON guardado.

## Paso 5: Botón Flotante Permanente (Derecho a Revocación)
1. Crear un botón fijo pequeño en la esquina inferior izquierda (ej. icono de cookie o escudo).
2. Al hacer clic, este botón debe reabrir el Modal de Configuración Avanzada.
3. Al abrirse, el modal debe leer el estado actual del `localStorage` y posicionar los toggles visuales (`checked = true/false`) reflejando la decisión actual del usuario para que pueda modificarla limpiamente.
