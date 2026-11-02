package com.sumbi.admission;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 전체 동시 접속 상한. 넘으면 대기열에 줄 세우고, 자리가 나면 앞사람부터 */
public class AdmissionService<T> {
    private final int maxTotal;
    private final Set<T> waiting = new LinkedHashSet<>();

    public AdmissionService(int maxTotal) {
        this.maxTotal = maxTotal;
    }

    /** 지금 인원으로 바로 들어갈 수 있는지 (대기 중인 사람이 있으면 새치기 안 함) */
    public synchronized boolean canEnter(int currentTotal) {
        return waiting.isEmpty() && currentTotal < maxTotal;
    }

    /** 대기열에 넣고 앞에 몇 명 있는지 */
    public synchronized int enqueue(T who) {
        waiting.add(who);
        return position(who);
    }

    public synchronized int position(T who) {
        int i = 0;
        for (T w : waiting) {
            if (w.equals(who)) return i;
            i++;
        }
        return -1;
    }

    public synchronized void remove(T who) {
        waiting.remove(who);
    }

    /** 자리가 난 만큼 앞사람부터 꺼냄 */
    public synchronized List<T> admit(int currentTotal) {
        List<T> out = new ArrayList<>();
        var it = waiting.iterator();
        int free = maxTotal - currentTotal;
        while (free > 0 && it.hasNext()) {
            out.add(it.next());
            it.remove();
            free--;
        }
        return out;
    }

    public synchronized List<T> waitingList() {
        return new ArrayList<>(waiting);
    }

    public synchronized int waitingCount() {
        return waiting.size();
    }
}
