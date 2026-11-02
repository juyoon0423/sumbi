package com.sumbi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SumbiApplication {
    public static void main(String[] args) {
        SpringApplication.run(SumbiApplication.class, args);
    }
}
