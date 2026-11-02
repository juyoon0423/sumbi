package com.sumbi.protocol;

/** 방에 있는 해녀 한 명 (welcome·join 에 담김) */
public record PlayerInfo(int id, String nick, LookInfo look, String zone, double[] p, double r, String st) {}
