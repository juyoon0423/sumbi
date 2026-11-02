package com.sumbi.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class CustomizeCatalogTest {
    final CustomizeCatalog catalog = new CustomizeCatalog();

    @Test
    void 목록에_있는_값만_허용() {
        assertThat(catalog.isValid(new NickParts("몽글몽글한", "돌고래"))).isTrue();
        assertThat(catalog.isValid(new NickParts("나쁜", "돌고래"))).isFalse();
        assertThat(catalog.isValid(new LookInfo("mint", "amber", "coral"))).isTrue();
        assertThat(catalog.isValid(new LookInfo("black", "amber", "coral"))).isFalse();
        assertThat(catalog.isValid((LookInfo) null)).isFalse();
    }

    @Test
    void 잘못된_항목만_랜덤으로_바꿈() {
        NickParts n = catalog.sanitize(new NickParts("<script>", "돌고래"));
        assertThat(n.noun()).isEqualTo("돌고래");
        assertThat(CustomizeCatalog.ADJECTIVES).contains(n.adj());
        LookInfo l = catalog.sanitize(new LookInfo("mint", "neon", null));
        assertThat(l.towel()).isEqualTo("mint");
        assertThat(catalog.isValid(l)).isTrue();
        assertThat(catalog.isValid(catalog.sanitize((NickParts) null))).isTrue();
    }

    @Test
    void 목록마다_30개_이상이고_중복_없음() {
        assertThat(CustomizeCatalog.ADJECTIVES).hasSizeGreaterThanOrEqualTo(30).doesNotHaveDuplicates();
        assertThat(CustomizeCatalog.NOUNS).hasSizeGreaterThanOrEqualTo(30).doesNotHaveDuplicates();
    }

    /** 프론트 customize.ts 와 목록이 같아야 함 (한쪽만 바꾸면 실패) */
    @Test
    void 프론트_목록과_같음() throws Exception {
        String dir = System.getProperty("sumbi.frontendDir");
        Path file = dir == null ? null : Path.of(dir, "src/haenyeo/customize.ts");
        assumeTrue(file != null && Files.exists(file), "frontend 폴더가 없으면 건너뜀");
        String ts = Files.readString(file);
        assertThat(stringArray(ts, "NICK_ADJECTIVES")).isEqualTo(CustomizeCatalog.ADJECTIVES);
        assertThat(stringArray(ts, "NICK_NOUNS")).isEqualTo(CustomizeCatalog.NOUNS);
        assertThat(paletteIds(ts, "TOWEL_PALETTE")).isEqualTo(CustomizeCatalog.TOWELS);
        assertThat(paletteIds(ts, "TEWAK_PALETTE")).isEqualTo(CustomizeCatalog.TEWAKS);
        assertThat(paletteIds(ts, "CHEEK_PALETTE")).isEqualTo(CustomizeCatalog.CHEEKS);
    }

    private static String block(String ts, String name) {
        int start = ts.indexOf("export const " + name);
        int open = ts.indexOf('[', start);
        int close = ts.indexOf("\n]", open);
        return ts.substring(open, close);
    }

    private static List<String> stringArray(String ts, String name) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("'([^']+)'").matcher(block(ts, name));
        while (m.find()) out.add(m.group(1));
        return out;
    }

    private static List<String> paletteIds(String ts, String name) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("id: '([^']+)'").matcher(block(ts, name));
        while (m.find()) out.add(m.group(1));
        return out;
    }
}
