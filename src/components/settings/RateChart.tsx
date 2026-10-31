"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { formatDate } from "@/lib/dates";

interface RatePoint {
  date: string;
  rate: number;
}

interface Props {
  rates: RatePoint[];
}

export default function RateChart({ rates }: Props) {
  const data = useMemo(() =>
    rates.map((r) => ({
      date: r.date,
      label: formatDate(r.date, { day: "numeric", month: "short" }),
      rate: +Number(r.rate).toFixed(4),
    })), [rates]);

  if (data.length < 2) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
        Il tasso viene rilevato automaticamente ogni giorno: il grafico apparirà
        dopo un paio di rilevazioni.
      </p>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v.toFixed(2)}
            width={44}
          />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(4)} CAD`, "1 EUR"]}
            labelFormatter={(label) => `Giorno: ${label}`}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#d01b26"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#d01b26", stroke: "#ffffff", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-gray-400">
        Rilevazione automatica giornaliera · {data.length} giorni ·
        ultimo: 1 EUR = {data[data.length - 1].rate.toFixed(4)} CAD
      </p>
    </div>
  );
}
