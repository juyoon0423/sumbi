package com.sumbi.catalog;

import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import java.util.List;
import java.util.Set;
import java.util.random.RandomGenerator;
import org.springframework.stereotype.Component;

/**
 * 닉네임 단어·꾸미기 색 허용 목록. 프론트 frontend/src/haenyeo/customize.ts 와 같은 값이어야 한다
 * (CustomizeCatalogTest 가 두 목록이 같은지 확인).
 */
@Component
public class CustomizeCatalog {

    public static final List<String> ADJECTIVES = List.of(
        "느린", "작은", "고요한", "따뜻한", "포근한", "잔잔한", "말랑한", "둥근",
        "수줍은", "졸린", "맑은", "느긋한", "반짝이는", "부드러운", "조용한", "푸른",
        "다정한", "상냥한", "해맑은", "보송한", "동그란", "몽글몽글한", "산뜻한", "싱그러운",
        "아늑한", "순한", "차분한", "은은한", "향긋한", "설레는", "꿈꾸는", "노래하는",
        "웃는", "사뿐한", "너그러운", "소박한");

    public static final List<String> NOUNS = List.of(
        "파도", "소라", "물결", "돌담", "전복", "성게", "해초", "갈매기",
        "조약돌", "물거품", "바닷바람", "윤슬", "테왁", "현무암", "노을", "등대",
        "감귤", "동백", "오름", "수평선", "모래알", "미역", "돌고래", "바당",
        "올레", "유채꽃", "수선화", "한라봉", "숨비소리", "달빛", "별빛", "조개",
        "몽돌", "물빛", "해님", "산호");

    public static final List<String> TOWELS = List.of("white", "sky", "pink", "yellow", "mint", "lilac", "peach", "gray");
    public static final List<String> TEWAKS = List.of("orange", "tangerine", "scarlet", "sunset", "amber", "yellow");
    public static final List<String> CHEEKS = List.of("pink", "peach", "rose", "coral");

    public static final Set<String> ITEMS = Set.of("conch", "abalone", "urchin");

    private final RandomGenerator random;

    public CustomizeCatalog() {
        this(RandomGenerator.getDefault());
    }

    public CustomizeCatalog(RandomGenerator random) {
        this.random = random;
    }

    /** List.of 는 null 을 찾으면 예외라서 따로 확인 */
    private static boolean in(List<String> list, String value) {
        return value != null && list.contains(value);
    }

    public boolean isValid(NickParts nick) {
        return nick != null && in(ADJECTIVES, nick.adj()) && in(NOUNS, nick.noun());
    }

    public boolean isValid(LookInfo look) {
        return look != null && in(TOWELS, look.towel()) && in(TEWAKS, look.tewak()) && in(CHEEKS, look.cheek());
    }

    /** 목록에 없는 항목만 랜덤으로 바꿈 (PLAN 7.2) */
    public NickParts sanitize(NickParts nick) {
        String adj = nick != null && in(ADJECTIVES, nick.adj()) ? nick.adj() : pick(ADJECTIVES);
        String noun = nick != null && in(NOUNS, nick.noun()) ? nick.noun() : pick(NOUNS);
        return new NickParts(adj, noun);
    }

    public LookInfo sanitize(LookInfo look) {
        String towel = look != null && in(TOWELS, look.towel()) ? look.towel() : pick(TOWELS);
        String tewak = look != null && in(TEWAKS, look.tewak()) ? look.tewak() : pick(TEWAKS);
        String cheek = look != null && in(CHEEKS, look.cheek()) ? look.cheek() : pick(CHEEKS);
        return new LookInfo(towel, tewak, cheek);
    }

    private String pick(List<String> list) {
        return list.get(random.nextInt(list.size()));
    }
}
