"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { DayPoint } from "@/lib/gamification";

export function ProgressChart({ series }: { series: DayPoint[] }) {
  const data = useMemo(() => {
    return series.map((point, i) => ({
      ...point,
      index: i,
      displayScore: point.averageScore ?? null,
    }));
  }, [series]);

  if (series.length === 0) return null;

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 0, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="date" 
            hide={true}
          />
          <YAxis 
            domain={[0, 100]} 
            tickFormatter={(val) => `${val}`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-ink-4)", fontSize: 12 }}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                if (data.displayScore === null) return null;
                return (
                  <div className="rounded-xl border border-white/10 bg-void/80 p-3 backdrop-blur-xl shadow-xl">
                    <p className="text-[12px] text-ink-3 mb-1">{data.date}</p>
                    <p className="text-[16px] font-display font-medium text-ink">Score: <span className="text-accent">{data.displayScore}</span></p>
                    <p className="text-[12px] text-ink-4 mt-1">{data.sessions} {data.sessions === 1 ? 'session' : 'sessions'}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area 
            type="monotone" 
            dataKey="displayScore" 
            stroke="var(--color-accent)" 
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#scoreGradient)" 
            connectNulls={false}
            activeDot={{ r: 6, fill: "var(--color-accent)", stroke: "var(--color-void)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
