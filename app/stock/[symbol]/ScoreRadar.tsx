'use client';

import {
  RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, ResponsiveContainer,
} from 'recharts';

import type { SentinelScore } from '@/lib/utils/types';

interface Props {
  scores: SentinelScore | null;
}

export function ScoreRadar({ scores }: Props) {
  if (!scores) {
    return <div className="h-[280px] flex items-center justify-center text-text-tertiary text-sm">No scores</div>;
  }

  const data = ([
    ['Technical', scores.technical_score],
    ['Fundamental', scores.fundamental_score],
    ['Insider', scores.insider_score],
    ['Institutional', scores.institutional_score],
    ['Earnings AI', scores.earnings_ai_score],
    ['Sentiment', scores.news_sentiment_score],
    ['Flow', scores.options_flow_score],
  ] as const).map(([label, val]) => ({
    subject: label,
    value: val ?? 50,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: '#9CA3AF', fontSize: 10 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: '#6B7280', fontSize: 9 }}
          tickCount={5}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
