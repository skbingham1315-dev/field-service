package com.bluedingo.phonebridge.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import com.bluedingo.phonebridge.PhoneBridgeApp
import com.bluedingo.phonebridge.R

/**
 * Main activity — device registration and status dashboard.
 * Minimal UI for a sideloaded single-user app.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val PERMISSIONS_REQUEST = 100
        private val REQUIRED_PERMISSIONS = arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.POST_NOTIFICATIONS,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Simple programmatic layout for sideloaded app
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }

        val title = TextView(this).apply {
            text = "BD Phone Bridge"
            textSize = 24f
        }
        layout.addView(title)

        val status = TextView(this).apply {
            text = "Status: Checking..."
            textSize = 16f
            setPadding(0, 24, 0, 24)
        }
        layout.addView(status)

        val tokenInput = EditText(this).apply {
            hint = "Paste device token (pbd_...)"
            isSingleLine = true
        }
        layout.addView(tokenInput)

        val registerBtn = Button(this).apply {
            text = "Register Device"
            setOnClickListener {
                val token = tokenInput.text.toString().trim()
                if (token.startsWith("pbd_")) {
                    (application as PhoneBridgeApp).saveToken(token)
                    status.text = "Status: Active - capturing SMS & calls"
                    Toast.makeText(this@MainActivity, "Device registered!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@MainActivity, "Invalid token format", Toast.LENGTH_SHORT).show()
                }
            }
        }
        layout.addView(registerBtn)

        val permBtn = Button(this).apply {
            text = "Grant Permissions"
            setOnClickListener { requestPermissions() }
        }
        layout.addView(permBtn)

        val infoText = TextView(this).apply {
            text = "\nHow to get a token:\n1. Log into FieldOps as admin\n2. Go to Settings > Phone Bridge\n3. Click 'Register Device'\n4. Copy the token and paste above"
            textSize = 14f
            setPadding(0, 48, 0, 0)
        }
        layout.addView(infoText)

        setContentView(layout)

        // Check if already registered
        val prefs = getSharedPreferences("phone_bridge", MODE_PRIVATE)
        if (prefs.getString("device_token", null) != null) {
            status.text = "Status: Active - capturing SMS & calls"
            tokenInput.setText("••••••••••••(saved)")
            tokenInput.isEnabled = false
        }

        // Check permissions
        checkPermissions()
    }

    private fun checkPermissions() {
        val missing = REQUIRED_PERMISSIONS.filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            requestPermissions()
        }
    }

    private fun requestPermissions() {
        ActivityCompat.requestPermissions(this, REQUIRED_PERMISSIONS, PERMISSIONS_REQUEST)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSIONS_REQUEST) {
            val denied = permissions.zip(grantResults.toList()).filter { it.second != PackageManager.PERMISSION_GRANTED }
            if (denied.isNotEmpty()) {
                Toast.makeText(this, "Some permissions denied: ${denied.map { it.first.substringAfterLast('.') }}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
