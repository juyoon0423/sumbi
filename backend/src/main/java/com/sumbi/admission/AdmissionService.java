package com.sumbi.admission;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 전체 동시 접속 상한과 대기열.
 * 자리가 나면 앞사람에게 "자리가 났어요"를 제안(offer)하고, 그 사람이 들어오겠다고 하면(accept) 입장.
 * 제안은 정해진 시간 안에 답이 없으면 대기열 맨 뒤로 (기다리는 동안 혼자 하는 바다에서 놀고 있으므로).
 * 제안 중인 자리도 찬 자리로 셈 → 상한을 넘지 않음. 상한은 서버를 끄지 않고 바꿀 수 있음.
 */
public class AdmissionService<T> {
    private volatile int maxTotal;
    private final Set<T> waiting = new LinkedHashSet<>();
    /** 자리를 제안받은 사람 → 제안이 끝나는 시각 */
    private final Map<T, Long> offers = new LinkedHashMap<>();
    /** 최근 대기열에서 들어간 시각 (예상 대기 시간 계산) */
    private final Deque<Long> recentAdmits = new ArrayDeque<>();
    private static final int ETA_SAMPLES = 6;

    public AdmissionService(int maxTotal) {
        this.maxTotal = maxTotal;
    }

    public int maxTotal() {
        return maxTotal;
    }

    public void setMaxTotal(int maxTotal) {
        this.maxTotal = Math.max(0, maxTotal);
    }

    /** 지금 인원으로 바로 들어갈 수 있는지 (기다리는 사람·제안 중인 자리가 있으면 새치기 안 함) */
    public synchronized boolean canEnter(int currentTotal) {
        return waiting.isEmpty() && offers.isEmpty() && currentTotal < maxTotal;
    }

    /** 대기열에 넣고 앞에 몇 명 있는지 */
    public synchronized int enqueue(T who) {
        waiting.add(who);
        return position(who);
    }

    /** 앞에 기다리는 사람 수 (제안받은 사람은 0) */
    public synchronized int position(T who) {
        if (offers.containsKey(who)) return 0;
        int i = 0;
        for (T w : waiting) {
            if (w.equals(who)) return i;
            i++;
        }
        return -1;
    }

    public synchronized void remove(T who) {
        waiting.remove(who);
        offers.remove(who);
    }

    /** 빈자리만큼 앞사람에게 자리를 제안. 새로 제안받은 사람 목록 */
    public synchronized List<T> offer(int currentTotal, long now, long ttlMs) {
        List<T> out = new ArrayList<>();
        var it = waiting.iterator();
        int free = maxTotal - currentTotal - offers.size();
        while (free > 0 && it.hasNext()) {
            T who = it.next();
            it.remove();
            offers.put(who, now + ttlMs);
            out.add(who);
            free--;
        }
        return out;
    }

    /** 제안받은 사람이 들어오겠다고 함. 제안이 살아 있으면 true (자리 확정) */
    public synchronized boolean accept(T who, long now) {
        Long until = offers.remove(who);
        if (until == null) return false;
        if (until < now) {
            waiting.add(who);
            return false;
        }
        recentAdmits.addLast(now);
        while (recentAdmits.size() > ETA_SAMPLES) recentAdmits.removeFirst();
        return true;
    }

    /** 답이 없던 제안을 거두고 대기열 맨 뒤로. 그 사람들 목록 */
    public synchronized List<T> expire(long now) {
        List<T> out = new ArrayList<>();
        var it = offers.entrySet().iterator();
        while (it.hasNext()) {
            var e = it.next();
            if (e.getValue() < now) {
                it.remove();
                waiting.add(e.getKey());
                out.add(e.getKey());
            }
        }
        return out;
    }

    public synchronized boolean isOffered(T who) {
        return offers.containsKey(who);
    }

    /**
     * 예상 대기 시간(초): 최근 들어간 간격의 평균 × (앞사람 수 + 1). 기록이 모자라면 null (화면엔 "잠시 후").
     */
    public synchronized Integer etaSeconds(int ahead, long now) {
        if (recentAdmits.size() < 2) return null;
        long span = now - recentAdmits.peekFirst();
        double perPerson = (double) span / recentAdmits.size();
        return (int) Math.min(3600, Math.round(perPerson * (ahead + 1) / 1000.0));
    }

    public synchronized List<T> waitingList() {
        return new ArrayList<>(waiting);
    }

    public synchronized int waitingCount() {
        return waiting.size();
    }

    public synchronized int offerCount() {
        return offers.size();
    }
}
