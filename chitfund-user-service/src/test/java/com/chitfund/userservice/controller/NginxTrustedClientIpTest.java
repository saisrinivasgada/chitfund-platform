package com.chitfund.userservice.controller;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.Network;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.MountableFile;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real integration test for the nginx trusted-client-IP boundary.
 *
 * Topology:
 *   Test JVM  →  nginx:alpine (production config subset)  →  Python echo backend
 *
 * The echo backend returns every header it received from nginx as a JSON object.
 * The test verifies that a forged X-ChitWise-Client-IP supplied by the client
 * is overwritten by nginx using $remote_addr (the TCP peer), so the upstream
 * service always sees the real connection origin and not an attacker-controlled
 * value.
 */
@Testcontainers(disabledWithoutDocker = true)
class NginxTrustedClientIpTest {

    static Network network;
    static GenericContainer<?> backend;
    static GenericContainer<?> nginxContainer;

    @BeforeAll
    @SuppressWarnings("resource")
    static void startContainers() {
        network = Network.newNetwork();

        // Python echo server: returns request headers as a JSON object
        backend = new GenericContainer<>("python:3.12-alpine")
                .withNetwork(network)
                .withNetworkAliases("backend")
                .withCopyFileToContainer(
                        MountableFile.forClasspathResource("header_echo_server.py"),
                        "/app/header_echo_server.py")
                .withCommand("python3", "/app/header_echo_server.py")
                .withExposedPorts(8000)
                .waitingFor(Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(30)));

        backend.start();

        // nginx with the production proxy_set_header rules (no SSL)
        nginxContainer = new GenericContainer<>("nginx:alpine")
                .withNetwork(network)
                .withNetworkAliases("nginx")
                .withCopyFileToContainer(
                        MountableFile.forClasspathResource("test-nginx.conf"),
                        "/etc/nginx/nginx.conf")
                .withExposedPorts(80)
                .waitingFor(Wait.forHttp("/").withStartupTimeout(Duration.ofSeconds(30)));

        nginxContainer.start();
    }

    @AfterAll
    static void stopContainers() {
        if (nginxContainer != null) nginxContainer.stop();
        if (backend != null) backend.stop();
        if (network != null) network.close();
    }

    private String getNginxUrl(String path) {
        return "http://localhost:" + nginxContainer.getMappedPort(80) + path;
    }

    private HttpResponse<String> get(String path, String... headerPairs) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(getNginxUrl(path)))
                .timeout(Duration.ofSeconds(10));
        for (int i = 0; i + 1 < headerPairs.length; i += 2) {
            builder.header(headerPairs[i], headerPairs[i + 1]);
        }
        return HttpClient.newHttpClient().send(builder.GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    // ── Core enforcement ──────────────────────────────────────────────────────

    @Test
    void nginxOverwritesForgedXChitWiseClientIpWithTcpPeer() throws Exception {
        String forgedIp = "1.2.3.4";
        HttpResponse<String> resp = get("/", "X-ChitWise-Client-IP", forgedIp);
        assertThat(resp.statusCode()).isEqualTo(200);

        // Python echo server lowercases headers but keeps hyphens → "x-chitwise-client-ip"
        String seen = extractHeader(resp.body(), "x-chitwise-client-ip");
        assertThat(seen).isNotBlank();
        assertThat(seen).isNotEqualTo(forgedIp); // nginx replaced it with TCP peer addr
    }

    @Test
    void nginxSetsXRealIpFromTcpPeer_notFromForgedHeader() throws Exception {
        HttpResponse<String> resp = get("/",
                "X-Real-IP", "9.8.7.6",
                "X-Forwarded-For", "9.8.7.6");
        assertThat(resp.statusCode()).isEqualTo(200);

        // X-Real-IP must be the TCP peer (not the forged value)
        String realIp = extractHeader(resp.body(), "x-real-ip");
        assertThat(realIp).isNotBlank();
        assertThat(realIp).isNotEqualTo("9.8.7.6");
        // Note: X-Forwarded-For will contain "9.8.7.6, <real-peer>" — that is correct nginx
        // behavior ($proxy_add_x_forwarded_for appends the TCP peer to the incoming chain).
        // The important guarantee is that X-Real-IP and X-ChitWise-Client-IP cannot be forged.
    }

    @Test
    void twoRequestsFromSameIp_haveIdenticalXChitWiseClientIp() throws Exception {
        HttpResponse<String> r1 = get("/", "X-ChitWise-Client-IP", "evil-1.1.1.1");
        HttpResponse<String> r2 = get("/", "X-ChitWise-Client-IP", "evil-2.2.2.2");

        // Both requests come from the same TCP peer (the test JVM) so nginx sets
        // the same $remote_addr on both — forged values are irrelevant.
        String ip1 = extractHeader(r1.body(), "x-chitwise-client-ip");
        String ip2 = extractHeader(r2.body(), "x-chitwise-client-ip");

        assertThat(ip1).isNotBlank();
        assertThat(ip1).isEqualTo(ip2);
        assertThat(ip1).doesNotContain("evil-1.1.1.1").doesNotContain("evil-2.2.2.2");
    }

    @Test
    void xChitWiseClientIpIsNotRequestIpFromForgedHeader() throws Exception {
        String forged = "255.255.255.255";
        HttpResponse<String> resp = get("/", "X-ChitWise-Client-IP", forged);

        String seen = extractHeader(resp.body(), "x-chitwise-client-ip");
        assertThat(seen).isNotEqualTo(forged);
    }

    /**
     * Extracts a header value from the JSON echo body (header names are lowercased + hyphenated).
     * e.g. extractHeader(body, "x-chitwise-client-ip") → "172.18.0.1"
     */
    private static String extractHeader(String json, String headerName) {
        // Header names come back as lowercase with hyphens from the Python echo server
        String key = "\"" + headerName.toLowerCase() + "\": \"";
        int start = json.indexOf(key);
        if (start < 0) {
            // Try without space after colon
            key = "\"" + headerName.toLowerCase() + "\":\"";
            start = json.indexOf(key);
        }
        if (start < 0) return "";
        start += key.length();
        int end = json.indexOf("\"", start);
        return end > start ? json.substring(start, end) : "";
    }
}
