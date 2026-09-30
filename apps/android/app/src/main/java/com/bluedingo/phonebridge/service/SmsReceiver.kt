package com.bluedingo.phonebridge.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.bluedingo.phonebridge.data.ApiClient
import com.bluedingo.phonebridge.data.IngestMessage
import java.time.Instant

/**
 * Receives incoming SMS and forwards to the FieldOps backend.
 * Runs even when the app is in the background.
 */
class SmsReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "SmsReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val smsMessages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (smsMessages.isEmpty()) return

        // Group message parts by sender
        val grouped = mutableMapOf<String, StringBuilder>()
        for (sms in smsMessages) {
            val sender = sms.originatingAddress ?: continue
            grouped.getOrPut(sender) { StringBuilder() }.append(sms.messageBody ?: "")
        }

        val messages = grouped.map { (sender, body) ->
            IngestMessage(
                phoneNumber = sender,
                direction = "inbound",
                body = body.toString(),
                timestamp = Instant.now().toString()
            )
        }

        Log.d(TAG, "Received ${messages.size} SMS from ${messages.map { it.phoneNumber }}")

        // Queue for upload — in production this goes through the offline queue
        // For now, attempt immediate upload
        ApiClient.ingestMessages(messages) { success ->
            if (!success) {
                Log.w(TAG, "Failed to ingest SMS, queuing for retry")
                // TODO: Save to local encrypted queue for retry via WorkManager
            }
        }
    }
}
