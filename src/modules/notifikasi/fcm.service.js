const { admin, fcmAvailable } = require('../../config/firebase');

class FCMService {
  async sendPushNotification(fcmToken, { title, body, data = {} }) {
    if (!fcmAvailable) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FCM-SIMULASI] Push ke ${fcmToken.slice(0, 10)}... | Judul: "${title}" | Pesan: "${body}"`);
      }
      return { success: true, simulated: true };
    }

    try {
      const message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      };

      const response = await admin.messaging().send(message);
      return { success: true, messageId: response };
    } catch (error) {
      console.warn(`⚠️ FCM send error ke token ${fcmToken}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async sendMulticastNotification(tokens = [], { title, body, data = {} }) {
    if (!tokens || tokens.length === 0) return;

    if (!fcmAvailable) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FCM-SIMULASI-MULTICAST] Push ke ${tokens.length} perangkat | Judul: "${title}" | Pesan: "${body}"`);
      }
      return { success: true, simulated: true };
    }

    try {
      const message = {
        tokens,
        notification: {
          title,
          body,
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      return { success: true, successCount: response.successCount, failureCount: response.failureCount };
    } catch (error) {
      console.warn('⚠️ FCM multicast error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new FCMService();

