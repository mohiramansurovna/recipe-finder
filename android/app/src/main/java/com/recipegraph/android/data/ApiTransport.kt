package com.recipegraph.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class HttpResponse(val status: Int, val body: String)

/** Network boundary. Implementations throw IOException when the backend cannot be reached. */
interface ApiTransport {
    suspend fun execute(
        method: String,
        path: String,
        body: Map<String, Any?>?,
        bearerToken: String?
    ): HttpResponse
}

class UrlConnectionTransport(private val apiBaseUrl: String) : ApiTransport {
    override suspend fun execute(
        method: String,
        path: String,
        body: Map<String, Any?>?,
        bearerToken: String?
    ): HttpResponse = withContext(Dispatchers.IO) {
        val connection = URL(apiBaseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 12_000
            connection.readTimeout = 45_000
            connection.setRequestProperty("Accept", "application/json")
            // Avoid reusing pooled connections the server has already closed (fixed-length POSTs are not retried).
            connection.setRequestProperty("Connection", "close")
            if (bearerToken != null) connection.setRequestProperty("Authorization", "Bearer $bearerToken")
            if (body != null || method == "POST") {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                val payload = body?.let { JSONObject(it).toString() }.orEmpty().toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(payload.size)
                connection.outputStream.use { it.write(payload) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            HttpResponse(status, stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty())
        } finally {
            connection.disconnect()
        }
    }
}
