package com.sumbi;

import com.sumbi.config.SumbiProperties;
import java.util.List;

public final class TestProps {
    private TestProps() {}

    public static SumbiProperties.Sea sea() {
        return new SumbiProperties.Sea(0, 8, 55, -40, 2, 5, 1.0);
    }

    public static SumbiProperties props(int roomCapacity, int maxTotal) {
        return new SumbiProperties(List.of("http://localhost:*"), roomCapacity, maxTotal, 100, 30_000, 20_000, 30, 1024, 3_000, 256 * 1024,
            5_000, 2_000, 1_000, new SumbiProperties.Bulteok(3_000, 4_000, 20, 4_000), sea());
    }
}
