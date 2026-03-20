const https = require('https');
const { RESEND_API_KEY, EMAIL_FROM } = require('../lib/config');

async function sendConfirmationEmail(reserva) {
  try {
    if (RESEND_API_KEY.includes('placeholder')) {
      console.log('✉️ [SIMULACRO EMAIL CONFIRMACIÓN] Enviando a', reserva.email);
      console.log(`   Hola ${reserva.nombre} | Servicio: ${reserva.servicio} | Fecha: ${reserva.fecha} | Hora: ${reserva.hora}`);
      return;
    }
    
    // Usamos fetch para mantener compatibilidad con el código original de server.js
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Escarcha Grooming Club <${EMAIL_FROM}>`,
        to: [reserva.email],
        subject: `✅ Cita Confirmada — Escarcha Grooming Club`,
        html: `
          <div style="background:#0a0a0a;padding:32px;font-family:sans-serif;color:#fff;max-width:600px;margin:auto">
            <h1 style="color:#C9A96E;font-size:1.4rem;margin-bottom:8px">✅ ¡Cita confirmada!</h1>
            <p style="color:#aaa;margin-bottom:24px">Hola <strong style="color:#fff">${reserva.nombre}</strong>, tu reserva está lista.</p>
            <div style="background:#111;border:1px solid #2a2a2a;padding:20px;border-radius:4px;margin-bottom:24px">
              <p style="margin:0 0 8px"><strong style="color:#C9A96E">Servicio:</strong> ${reserva.servicio}</p>
              <p style="margin:0 0 8px"><strong style="color:#C9A96E">Barbero:</strong> ${reserva.barbero}</p>
              <p style="margin:0 0 8px"><strong style="color:#C9A96E">Fecha:</strong> ${reserva.fecha}</p>
              <p style="margin:0"><strong style="color:#C9A96E">Hora:</strong> ${reserva.hora}</p>
            </div>
            <p style="color:#aaa;font-size:0.85rem">Escarcha Grooming Club — C/ Rosario Pino, 18, Madrid</p>
          </div>`
      })
    });
    console.log(`✉️ Email de confirmación enviado a ${reserva.email}`);
  } catch (error) {
    console.error('Error enviando Email de confirmación:', error);
  }
}

module.exports = { sendConfirmationEmail };
