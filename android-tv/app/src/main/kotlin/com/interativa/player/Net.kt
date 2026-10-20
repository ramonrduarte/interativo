package com.interativa.player

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/** Chamadas HTTP simples (sempre fora da thread principal). */
object Net {

    /** Confere se o endereço responde como servidor Interativa (/api/health). */
    fun checkServer(baseUrl: String): Result<Unit> = runCatching {
        val conn = open("$baseUrl/api/health", "GET")
        val code = conn.responseCode
        if (code != 200) error("O servidor respondeu com erro ($code). Confira o endereço.")
        val body = read(conn)
        if (!JSONObject(body).optBoolean("ok", false)) error("Esse endereço não parece ser um servidor Interativa.")
    }.recoverCatching { throw friendly(it) }

    /** Login (mesmo fluxo do app antigo): devolve o pairing_token da empresa. */
    fun companyTokenFromLogin(baseUrl: String, user: String, password: String): Result<String> = runCatching {
        val login = open("$baseUrl/api/auth/login", "POST").apply {
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }
        val body = JSONObject().put("email", user).put("password", password).toString()
        OutputStreamWriter(login.outputStream, Charsets.UTF_8).use { it.write(body) }
        if (login.responseCode != 200) {
            val err = login.errorStream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() }.orEmpty()
            val msg = runCatching { JSONObject(err).getString("error") }.getOrNull() ?: "Usuário ou senha incorretos"
            error(msg)
        }
        val jwt = JSONObject(read(login)).getString("token")

        val company = open("$baseUrl/api/company", "GET").apply {
            setRequestProperty("Authorization", "Bearer $jwt")
        }
        if (company.responseCode != 200) error("Erro ao obter dados da empresa (${company.responseCode})")
        val token = JSONObject(read(company)).optString("pairing_token", "")
        if (token.isBlank() || token == "null") error("Esta conta não tem token de pareamento")
        token
    }.recoverCatching { throw friendly(it) }

    private fun open(url: String, method: String) = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 10_000
        readTimeout = 10_000
        setRequestProperty("User-Agent", MediaCache.USER_AGENT)
    }

    private fun read(conn: HttpURLConnection) =
        BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }

    private fun friendly(t: Throwable): Throwable = when (t) {
        is java.net.UnknownHostException -> Exception("Endereço não encontrado. Confira o servidor e a internet da TV.")
        is java.net.ConnectException, is java.net.SocketTimeoutException -> Exception("Não foi possível conectar ao servidor.")
        is javax.net.ssl.SSLException -> Exception("Falha de segurança (HTTPS). Confira o endereço e a data/hora da TV.")
        is org.json.JSONException -> Exception("Resposta inesperada do servidor. Confira o endereço.")
        else -> t
    }
}
