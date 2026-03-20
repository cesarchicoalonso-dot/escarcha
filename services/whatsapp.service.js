const { TWILIO_ACCT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUM } = require('../lib/config');
const Barberos = require('../repositories/barberos.repository');

async function sendWhatsAppReminder(reserva) {
  try {
    if (TWILIO_ACCT_SID.includes('placeholder')) {
      console.log('📱 [SIMULACRO WHATSAPP] Enviando recordatorio 24h a', reserva.telefono);
      return;
    }

    const auth = Buffer.from(`${TWILIO_ACCT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', `whatsapp:${reserva.telefono}`);
    params.append('From', `whatsapp:${TWILIO_FROM_NUM}`);
    
    const barberos = await Barberos.getAll();
    const b = barberos.find(x => x.id === reserva.barbero);
    const nombreBarbero = b ? `${b.nombre} ${b.apellido || ''}`.trim() : reserva.barbero;

    const fechaFormateada = reserva.fecha.split('-').reverse().join('/');
    const msg = `Hola *${reserva.nombre}*, nos ponemos en contacto contigo desde *Escarcha Grooming Club / Barbería* para confirmar la cita que tienes con *${nombreBarbero}* el día *${fechaFormateada}* 📅 a las *${reserva.hora}* 🕒

🤝 La reserva es un compromiso de asistencia en la fecha y hora acordadas, por eso te rogamos encarecidamente que, en caso de no poder acudir, por favor, avísanos a la mayor brevedad posible para poder agendar a otro cliente en lista de espera y así no perder esa hora 😊

⏰ Damos *10 minutos de cortesía*, a partir de ahí, la cita se anula automáticamente por respeto al resto de clientes agendados, por lo que, si vas a sufrir algún retraso, llámanos ☎️ para poder reajustar la agenda 😉

Gracias por confiar en Escarcha Grooming Club / Barbería
¡QUÉ TENGAS UN BONITO DÍA! ☀️`;

    params.append('Body', msg);
    
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCT_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    console.log(`📱 WhatsApp enviado a ${reserva.telefono}`);
  } catch (error) {
    console.error('Error enviando WhatsApp:', error);
  }
}

module.exports = { sendWhatsAppReminder };
