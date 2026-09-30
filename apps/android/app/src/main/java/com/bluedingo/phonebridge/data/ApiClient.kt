package com.bluedingo.phonebridge.data

import com.bluedingo.phonebridge.BuildConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

@Serializable
data class IngestMessage(
    val phoneNumber: String,
    val displayName: String? = null,
    val direction: String,
    val body: String,
    val timestamp: String,
    val source: String = "captured"
)

@Serializable
data class IngestCall(
    val phoneNumber: String,
    val displayName: String? = null,
    val direction: String,
    val duration: Int,
    val timestamp: String,
    val hasVoicemail: Boolean = false
)

@Serializable
data class IngestMessagesRequest(val messages: List<IngestMessage>)

@Serializable
data class IngestCallsRequest(val calls: List<IngestCall>)

@Serializable
data class DraftReply(
    val id: String,
    val body: String,
    val status: String,
    val threadId: String,
    val thread: DraftThread? = null
)

@Serializable
data class DraftThread(val phoneNumber: String, val displayName: String? = null)

@Serializable
data class DraftDecision(val action: String, val editedBody: String? = null)

@Serializable
data class SyncResponse(
    val config: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    val isActive: Boolean = true,
    val pendingDrafts: Int = 0
)

object ApiClient {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val JSON_MEDIA = "application/json".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private var deviceToken: String? = null
    private val baseUrl = BuildConfig.API_BASE_URL

    fun setToken(token: String) { deviceToken = token }

    private fun authHeaders(): Headers {
        return Headers.Builder()
            .add("Authorization", "Bearer ${deviceToken ?: ""}")
            .add("Content-Type", "application/json")
            .build()
    }

    // ── Ingest SMS ───────────────────────────────────────────────────────────
    fun ingestMessages(messages: List<IngestMessage>, callback: (Boolean) -> Unit) {
        val body = json.encodeToString(IngestMessagesRequest(messages)).toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/phone-bridge/ingest/messages")
            .headers(authHeaders())
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { callback(false) }
            override fun onResponse(call: Call, response: Response) { callback(response.isSuccessful) }
        })
    }

    // ── Ingest calls ─────────────────────────────────────────────────────────
    fun ingestCalls(calls: List<IngestCall>, callback: (Boolean) -> Unit) {
        val body = json.encodeToString(IngestCallsRequest(calls)).toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/phone-bridge/ingest/calls")
            .headers(authHeaders())
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { callback(false) }
            override fun onResponse(call: Call, response: Response) { callback(response.isSuccessful) }
        })
    }

    // ── Get pending drafts ───────────────────────────────────────────────────
    fun getPendingDrafts(callback: (List<DraftReply>?) -> Unit) {
        val request = Request.Builder()
            .url("$baseUrl/api/v1/phone-bridge/device/drafts")
            .headers(authHeaders())
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { callback(null) }
            override fun onResponse(call: Call, response: Response) {
                // Parse response — simplified for scaffold
                callback(emptyList())
            }
        })
    }

    // ── Decide on draft ──────────────────────────────────────────────────────
    fun decideDraft(draftId: String, action: String, editedBody: String? = null, callback: (Boolean) -> Unit) {
        val body = json.encodeToString(DraftDecision(action, editedBody)).toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/phone-bridge/device/drafts/$draftId/decide")
            .headers(authHeaders())
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { callback(false) }
            override fun onResponse(call: Call, response: Response) { callback(response.isSuccessful) }
        })
    }

    // ── Sync / heartbeat ─────────────────────────────────────────────────────
    fun sync(callback: (SyncResponse?) -> Unit) {
        val request = Request.Builder()
            .url("$baseUrl/api/v1/phone-bridge/device/sync")
            .headers(authHeaders())
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { callback(null) }
            override fun onResponse(call: Call, response: Response) {
                callback(SyncResponse()) // Simplified for scaffold
            }
        })
    }
}
