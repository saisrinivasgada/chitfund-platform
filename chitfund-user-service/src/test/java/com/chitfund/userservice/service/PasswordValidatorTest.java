package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PasswordValidatorTest {
    private static final String PASSWORD = "UnseenFixture@9482";
    private final AtomicReference<HttpHandler> handler = new AtomicReference<>();
    private final AtomicInteger requests = new AtomicInteger();
    private final CountDownLatch releaseServer = new CountDownLatch(1);
    private HttpServer server;
    private ExecutorService executor;
    private HttpClient client;
    private URI base;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool(task -> {
            Thread thread = new Thread(task, "password-range-fixture");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(executor);
        server.createContext("/range/", exchange -> {
            requests.incrementAndGet();
            try { handler.get().handle(exchange); }
            finally { exchange.close(); }
        });
        respond(200, "0".repeat(35) + ":0\r\n");
        server.start();
        base = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/range/");
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    }

    @AfterEach
    void stop() {
        releaseServer.countDown();
        server.stop(0);
        executor.shutdownNow();
    }

    private PasswordValidator validator() {
        return new PasswordValidator(client, base, Duration.ofSeconds(2));
    }

    private PasswordValidator slowProviderValidator() {
        return new PasswordValidator(client, base, Duration.ofMillis(400));
    }

    private void respond(int status, String text) {
        handler.set(exchange -> {
            byte[] body = text.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
        });
    }

    private String hash() throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1")
                .digest(PASSWORD.getBytes(StandardCharsets.UTF_8))).toUpperCase();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"Short1!", "lowercase1!", "UPPERCASE1!", "NoNumbers!", "NoSpecial123"})
    void localStrengthRulesRejectWithoutContactingProvider(String password) {
        assertThatThrownBy(() -> validator().validate(password)).isInstanceOf(BusinessException.class);
        assertThat(requests).hasValue(0);
    }

    @Test
    void clearRangeSendsOnlyFiveHashCharactersAndRequestsPrivacyPadding() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        AtomicReference<String> padding = new AtomicReference<>();
        handler.set(exchange -> {
            path.set(exchange.getRequestURI().toString());
            padding.set(exchange.getRequestHeaders().getFirst("Add-Padding"));
            byte[] body = ("A".repeat(35) + ":123\r\n").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
        });
        // Exercise the production constructor, including the configured base URL.
        PasswordValidator configured = new PasswordValidator(base.toString());
        assertThatCode(() -> configured.validate(PASSWORD)).doesNotThrowAnyException();
        assertThat(path.get()).isEqualTo("/range/" + hash().substring(0, 5));
        assertThat(padding.get()).isEqualTo("true");
        assertThat(path.get()).doesNotContain(PASSWORD).doesNotContain(hash().substring(5));
    }

    @Test
    void positiveExactSuffixRejectsKnownBreachCaseInsensitively() throws Exception {
        respond(200, hash().substring(5).toLowerCase() + ":42\r\n");
        assertThatThrownBy(() -> validator().validate(PASSWORD))
                .isInstanceOf(BusinessException.class).hasMessageContaining("known data breach");
    }

    @Test
    void matchingZeroCountPaddingAndOtherPositiveSuffixesDoNotReject() throws Exception {
        respond(200, hash().substring(5) + ":0\r\n" + "B".repeat(35) + ":42\r\n");
        assertThatCode(() -> validator().validate(PASSWORD)).doesNotThrowAnyException();
    }

    @Test
    void unavailableProviderPreservesExistingFailOpenPolicy() {
        respond(503, "Temporarily unavailable");
        assertThatCode(() -> validator().validate(PASSWORD)).doesNotThrowAnyException();
    }

    @Test
    void refusedConnectionIsBoundedAndPreservesExistingFailOpenPolicy() {
        server.stop(0);
        assertTimeoutPreemptively(Duration.ofSeconds(3), () -> validator().validate(PASSWORD));
    }

    @Test
    void headersThatNeverArriveCannotBlockAccountSetup() {
        handler.set(exchange -> awaitRelease());
        assertTimeoutPreemptively(Duration.ofSeconds(3), () -> slowProviderValidator().validate(PASSWORD));
        assertThat(requests).hasValue(1);
    }

    @Test
    void responseBodyThatStallsAfterHeadersAlsoHasAnOverallDeadline() {
        handler.set(exchange -> {
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write('A');
            exchange.getResponseBody().flush();
            awaitRelease();
        });
        assertTimeoutPreemptively(Duration.ofSeconds(3), () -> slowProviderValidator().validate(PASSWORD));
        assertThat(requests).hasValue(1);
    }

    @Test
    void timeoutCancelsThePendingExchange() {
        HttpClient transport = mock(HttpClient.class);
        CompletableFuture<HttpResponse<String>> pending = new CompletableFuture<>();
        when(transport.<String>sendAsync(any(), any())).thenReturn(pending);
        PasswordValidator subject = new PasswordValidator(transport, base, Duration.ofMillis(25));
        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> subject.validate(PASSWORD));
        assertThat(pending).isCancelled();
    }

    @Test
    void interruptionCancelsTheExchangeAndRestoresTheInterruptFlag() {
        HttpClient transport = mock(HttpClient.class);
        CompletableFuture<HttpResponse<String>> pending = new CompletableFuture<>();
        when(transport.<String>sendAsync(any(), any())).thenReturn(pending);
        PasswordValidator subject = new PasswordValidator(transport, base, Duration.ofSeconds(5));
        try {
            Thread.currentThread().interrupt();
            subject.validate(PASSWORD);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(pending).isCancelled();
        } finally { Thread.interrupted(); }
    }

    @ParameterizedTest
    @ValueSource(strings = {"http:/range/", "file:///range/", "https://example.test/range",
            "https://user:pass@example.test/range/", "https://example.test/range/?x=1", "https://example.test/range/#x"})
    void invalidProviderConfigurationFailsAtStartup(String url) {
        assertThatThrownBy(() -> new PasswordValidator(url)).isInstanceOf(IllegalArgumentException.class);
    }

    private void awaitRelease() {
        try { releaseServer.await(5, TimeUnit.SECONDS); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
