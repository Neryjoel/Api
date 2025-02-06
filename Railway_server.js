const express = require('express');
const bodyParser = require('body-parser');
const ewelink = require('ewelink-api');
const twilio = require('twilio');

// Configuración de conexión a eWeLink usando variables de entorno
const connection = new ewelink({
    email: process.env.EWELINK_EMAIL,
    password: process.env.EWELINK_PASSWORD,
    region: 'us', 
    APP_ID: process.env.EWELINK_APP_ID,
    APP_SECRET: process.env.EWELINK_APP_SECRET
});

// Configuración de Twilio usando variables de entorno
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Lista de números autorizados
const authorizedNumbers = new Set([
    'whatsapp:+1234567890', 
    'whatsapp:+595983882107', 
    'whatsapp:+595992667927'
]);

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Función para enviar notificación por WhatsApp
const sendNotification = async (message, toPhoneNumber) => {
    try {
        await client.messages.create({
            from: fromPhoneNumber,
            to: toPhoneNumber,
            body: message,
        });
        console.log(`Notificación enviada: ${message}`);
    } catch (error) {
        console.error('Error al enviar la notificación:', error);
    }
};

// Función para procesar el mensaje de WhatsApp
const processWhatsAppMessage = async (message, toPhoneNumber) => {
    const messageParts = message.split(' ');
    const command = messageParts[0].toLowerCase();

    // Comando para agregar usuarios
    if (command === 'adduser') {
        if (!authorizedNumbers.has(toPhoneNumber)) {
            await sendNotification('⚠️ No tienes permiso para agregar usuarios.', toPhoneNumber);
            return;
        }
        const newNumber = messageParts[1]?.trim();
        if (!newNumber.startsWith('whatsapp:+')) {
            await sendNotification('⚠️ Formato incorrecto. Usa: adduser whatsapp:+1234567890', toPhoneNumber);
            return;
        }
        authorizedNumbers.add(newNumber);
        await sendNotification(`✅ Número autorizado: ${newNumber}`, toPhoneNumber);
        return;
    }

    // Validar si el usuario tiene permiso
    if (!authorizedNumbers.has(toPhoneNumber)) {
        await sendNotification('⚠️ No tienes permiso para usar este bot.', toPhoneNumber);
        return;
    }

    // Comandos para controlar dispositivos
    if (['on', 'off'].includes(command)) {
        const deviceName = messageParts.slice(1).join(' ').trim();
        await controlDevice(deviceName, command, toPhoneNumber);
    } else {
        await sendNotification('⚠️ Comando no reconocido. Usa "on [dispositivo]" o "off [dispositivo]".', toPhoneNumber);
    }
};

const controlDevice = async (deviceName, action, toPhoneNumber) => {
    try {
        const devices = await connection.getDevices();
        console.log(devices);  // Imprime los dispositivos disponibles
        const device = devices.find(d => d.name.toLowerCase() === deviceName.toLowerCase());

        if (!device) {
            await sendNotification(`⚠️ No se encontró un dispositivo llamado ${deviceName}.`, toPhoneNumber);
            return;
        }

        const deviceID = device.deviceid;
        const result = await connection.setDevicePowerState(deviceID, action.toLowerCase());

        if (result) {
            await sendNotification(`✅ El dispositivo ${deviceName} ha sido ${action === 'on' ? 'encendido' : 'apagado'}.`, toPhoneNumber);
        } else {
            await sendNotification(`⚠️ No se pudo cambiar el estado del dispositivo ${deviceName}.`, toPhoneNumber);
        }
    } catch (error) {
        console.error('Error al controlar el dispositivo:', error);
        await sendNotification('⚠️ Hubo un error al intentar controlar el dispositivo.', toPhoneNumber);
    }
};

// Endpoint para recibir mensajes de WhatsApp
app.post('/whatsapp', async (req, res) => {
    const incomingMessage = req.body.Body;
    const fromPhoneNumber = req.body.From;

    console.log(`Mensaje recibido: ${incomingMessage} de ${fromPhoneNumber}`);

    // Procesar el mensaje
    await processWhatsAppMessage(incomingMessage, fromPhoneNumber);

    res.send('<Response></Response>');
});

// Iniciar servidor
app.listen(3000, () => {
    console.log('Servidor en funcionamiento en http://localhost:3000');
});
