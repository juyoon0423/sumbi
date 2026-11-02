package com.sumbi.protocol;

/** 닉네임 조합: 앞말 + 뒷말 */
public record NickParts(String adj, String noun) {
    public String display() {
        return adj + " " + noun;
    }
}
