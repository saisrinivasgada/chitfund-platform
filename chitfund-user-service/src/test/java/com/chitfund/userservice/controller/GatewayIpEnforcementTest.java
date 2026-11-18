package com.chitfund.userservice.controller;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Structural regression guard: every controller that extracts a client IP must
 * read X-ChitWise-Client-IP (set by nginx from $remote_addr), never X-Real-IP.
 *
 * X-Real-IP can be supplied by the client and bypasses rate limiting.
 * nginx always overwrites X-ChitWise-Client-IP with the TCP peer address, so
 * it cannot be forged by public callers.
 */
class GatewayIpEnforcementTest {

    private static final Path CONTROLLER_DIR = Paths.get(
            "src/main/java/com/chitfund/userservice/controller");

    @Test
    void noControllerCallsGetHeaderForXRealIp() throws IOException {
        // Match only getHeader("X-Real-IP") — the actual retrieval call.
        // Comments that mention X-Real-IP for documentation are acceptable.
        try (Stream<Path> files = Files.walk(CONTROLLER_DIR)) {
            files.filter(p -> p.toString().endsWith("Controller.java"))
                    .forEach(path -> {
                        try {
                            String content = Files.readString(path);
                            assertThat(content)
                                    .as("Controller %s calls getHeader(\"X-Real-IP\") which is client-controlled. " +
                                        "Use X-ChitWise-Client-IP (set by nginx from $remote_addr) instead.",
                                            path.getFileName())
                                    .doesNotContain("getHeader(\"X-Real-IP\")");
                        } catch (IOException e) {
                            throw new RuntimeException("Could not read " + path, e);
                        }
                    });
        }
    }

    @Test
    void allControllerGetClientIpMethodsReadChitwiseClientIpHeader() throws IOException {
        try (Stream<Path> files = Files.walk(CONTROLLER_DIR)) {
            files.filter(p -> p.toString().endsWith("Controller.java"))
                    .forEach(path -> {
                        try {
                            String content = Files.readString(path);
                            if (content.contains("getClientIp")) {
                                assertThat(content)
                                        .as("Controller %s missing X-ChitWise-Client-IP in getClientIp()",
                                                path.getFileName())
                                        .contains("X-ChitWise-Client-IP");
                            }
                        } catch (IOException e) {
                            throw new RuntimeException("Could not read " + path, e);
                        }
                    });
        }
    }
}
