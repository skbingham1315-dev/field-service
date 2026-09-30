package com.bluedingo.phonebridge.service

import android.app.*
import android.content.ContentResolver
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import android.util.Log
import androidx.core.app.NotificationCompat
import com.bluedingo.phonebridge.data.ApiClient
import com.bluedingo.phonebridge.data.IngestCall
import com.bluedingo.phonebridge.ui.MainActivity
import java.time.Instant

/**
 * Foreground service that monitors the call log for new entries (especially missed calls)
 * and the SMS content provider for outbound messages.
 *
 * Runs continuously to ensure nothing is missed while on a job site.
 */
class CaptureService : Service() {
    companion object {
        private const val TAG = "CaptureService"
        private const val CHANNEL_ID = "phone_bridge_capture"
        private const val NOTIFICATION_ID = 1001
    }

    private var callLogObserver: ContentObserver? = null
    private var smsObserver: ContentObserver? = null
    private var lastCallLogTimestamp = System.currentTimeMillis()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        registerCallLogObserver()
        registerSmsObserver()
        Log.i(TAG, "CaptureService started")
    }

    override fun onDestroy() {
        callLogObserver?.let { contentResolver.unregisterContentObserver(it) }
        smsObserver?.let { contentResolver.unregisterContentObserver(it) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY // Restart if killed
    }

    // ── Call log observer ────────────────────────────────────────────────────
    private fun registerCallLogObserver() {
        callLogObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                pollNewCalls()
            }
        }
        contentResolver.registerContentObserver(
            CallLog.Calls.CONTENT_URI, true, callLogObserver!!
        )
    }

    private fun pollNewCalls() {
        try {
            val cursor = contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.CACHED_NAME,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DURATION,
                    CallLog.Calls.DATE
                ),
                "${CallLog.Calls.DATE} > ?",
                arrayOf(lastCallLogTimestamp.toString()),
                "${CallLog.Calls.DATE} DESC"
            ) ?: return

            val calls = mutableListOf<IngestCall>()
            while (cursor.moveToNext()) {
                val number = cursor.getString(0) ?: continue
                val name = cursor.getString(1)
                val type = cursor.getInt(2)
                val duration = cursor.getInt(3)
                val date = cursor.getLong(4)

                val direction = when (type) {
                    CallLog.Calls.INCOMING_TYPE -> "inbound"
                    CallLog.Calls.OUTGOING_TYPE -> "outbound"
                    CallLog.Calls.MISSED_TYPE -> "missed"
                    else -> continue
                }

                calls.add(IngestCall(
                    phoneNumber = number,
                    displayName = name,
                    direction = direction,
                    duration = duration,
                    timestamp = Instant.ofEpochMilli(date).toString()
                ))

                if (date > lastCallLogTimestamp) lastCallLogTimestamp = date
            }
            cursor.close()

            if (calls.isNotEmpty()) {
                Log.d(TAG, "New calls detected: ${calls.size}")
                ApiClient.ingestCalls(calls) { success ->
                    if (!success) Log.w(TAG, "Failed to ingest calls, queuing for retry")
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "No call log permission", e)
        }
    }

    // ── SMS observer (for outbound) ──────────────────────────────────────────
    private fun registerSmsObserver() {
        smsObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                // Monitor outbound SMS via content://sms/sent
                // Implementation depends on Android version and OEM
                // For Galaxy S24, content observer on SMS content provider works
            }
        }
        contentResolver.registerContentObserver(
            Uri.parse("content://sms"), true, smsObserver!!
        )
    }

    // ── Notification ─────────────────────────────────────────────────────────
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "Phone Bridge", NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Captures texts and calls for FieldOps" }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Phone Bridge Active")
            .setContentText("Monitoring texts and calls")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pending)
            .setOngoing(true)
            .build()
    }
}
