package com.sumbi.protocol;

/**
 * 방에 있는 해녀 한 명 (welcome·join 에 담김).
 * zone: sea | bulteok, seat: 불턱 자리, st: surface | underwater | sit | doze
 */
public record PlayerInfo(int id, String nick, LookInfo look, String zone, double[] p, double r, Integer seat, String st) {}
