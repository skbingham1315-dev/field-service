package com.bluedingo.phonebridge

import android.app.Application
import android.content.Intent
import android.os.Build
import com.bluedingo.phonebridge.data.ApiClient
import com.bluedingo.phonebridge.service.CaptureService

class PhoneBridgeApp : Application() {
    override fun onCreate() {
        super.onCreate()

        // Load saved device token from encrypted shared prefs
        val prefs = getSharedPreferences("phone_bridge", MODE_PRIVATE)
        val token = prefs.getString("device_token", null)
        if (token != null) {
            ApiClient.setToken(token)
            startCaptureService()
        }
    }

    fun saveToken(token: String) {
        getSharedPreferences("phone_bridge", MODE_PRIVATE)
            .edit().putString("device_token", token).apply()
        ApiClient.setToken(token)
        startCaptureService()
    }

    private fun startCaptureService() {
        val intent = Intent(this, CaptureService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }
}
