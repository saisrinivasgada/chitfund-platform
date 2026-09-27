package com.chitfund.chitservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ChitServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ChitServiceApplication.class, args);
    }
}
