import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { buildTrend, DayPoint, TrendSummary } from '@/utils/aggregate';

import './index.scss';

const TRACK_RPX = 220; // 柱子最大高度

function barHeight(anxiety: number | null): string {
  if (anxiety == null) return '6rpx';
  const h = Math.round((anxiety / 10) * TRACK_RPX);
  return `${Math.max(h, 8)}rpx`;
}

function barColor(valence: number | null): string {
  if (valence == null) return '#c7cad0';
  if (valence >= 0.15) return '#34c759'; // 情绪偏正
  if (valence <= -0.2) return '#ff9500'; // 情绪偏负
  return '#a0a4ab'; // 中性
}

function shortDay(day: string): string {
  const p = day.split('-');
  return `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}`;
}

function trendText(s: TrendSummary): string {
  if (s.anxietyDelta == null || s.recentAnxiety == null || s.earlierAnxiety == null) {
    return '记录还不多,多记几天就能看出焦虑的走向。';
  }
  const r = s.recentAnxiety.toFixed(1);
  const e = s.earlierAnxiety.toFixed(1);
  if (s.anxietyDelta <= -1) return `最近焦虑在下降(${e} → ${r}),状态在往好走 🌤`;
  if (s.anxietyDelta >= 1) return `最近焦虑在上升(${e} → ${r}),记得给自己松口气 🫖`;
  return `最近焦虑比较平稳,大约 ${r}/10。`;
}

export default function Trends() {
  const [data, setData] = useState<TrendSummary | null>(null);

  useDidShow(() => {
    setData(buildTrend());
  });

  if (!data || data.totalEntries === 0) {
    return (
      <View className='page'>
        <View className='empty'>还没有可分析的记录。先去首页记几条,这里就会长出曲线。</View>
      </View>
    );
  }

  const { days } = data;

  return (
    <View className='page'>
      {/* 概览 */}
      <View className='card overview'>
        <View className='ov-item'>
          <Text className='ov-num'>{data.totalEntries}</Text>
          <Text className='ov-label'>条记录</Text>
        </View>
        <View className='ov-item'>
          <Text className='ov-num'>{data.daysTracked}</Text>
          <Text className='ov-label'>天</Text>
        </View>
        <View className='ov-item'>
          <Text className='ov-num'>{data.avgAnxiety == null ? '—' : data.avgAnxiety.toFixed(1)}</Text>
          <Text className='ov-label'>平均焦虑</Text>
        </View>
      </View>

      {/* 趋势一句话 */}
      <View className='card'>
        <Text className='trend-sentence'>🧭 {trendText(data)}</Text>
      </View>

      {/* 焦虑柱状图(颜色=当天情绪) */}
      <View className='card'>
        <Text className='card-title'>焦虑趋势</Text>
        <ScrollView scrollX className='chart-scroll'>
          <View className='chart'>
            {days.map((d: DayPoint) => (
              <View className='bar-col' key={d.day}>
                <Text className='bar-val'>{d.anxiety == null ? '' : Math.round(d.anxiety)}</Text>
                <View className='bar-track'>
                  <View
                    className='bar'
                    style={{ height: barHeight(d.anxiety), background: barColor(d.valence) }}
                  />
                </View>
                <Text className='bar-day'>{shortDay(d.day)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View className='legend'>
          <Text className='legend-item'>
            <Text className='dot' style={{ background: '#34c759' }} /> 情绪好
          </Text>
          <Text className='legend-item'>
            <Text className='dot' style={{ background: '#a0a4ab' }} /> 平稳
          </Text>
          <Text className='legend-item'>
            <Text className='dot' style={{ background: '#ff9500' }} /> 低落
          </Text>
          <Text className='legend-hint'>柱高 = 焦虑(0-10)</Text>
        </View>
      </View>

      {/* 高频主题 */}
      {data.topTopics.length > 0 ? (
        <View className='card'>
          <Text className='card-title'>最近常出现的主题</Text>
          <View className='topic-row'>
            {data.topTopics.map((t) => (
              <Text className='chip topic' key={t.topic}>
                {t.topic} · {t.count}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* 信号:AI 从记录里读出的具体苗头 */}
      {data.signals.length > 0 ? (
        <View className='card'>
          <Text className='card-title'>AI 注意到的苗头</Text>
          <Text className='signal-intro'>
            这些是 AI 从你最近的记录里读出的、可能影响未来走向的念头。点一条能回到当时那篇。
          </Text>
          {data.signals.map((s) => (
            <View
              className='signal-item'
              key={`${s.entryId}-${s.text}`}
              onClick={() => Taro.navigateTo({ url: `/pages/detail/index?id=${s.entryId}` })}>
              <Text
                className='signal-tag'
                style={{ color: s.direction === 'toward_wanted' ? '#34c759' : '#ff9500' }}>
                {s.direction === 'toward_wanted' ? '↗ 想靠近' : '↘ 想警惕'}
              </Text>
              <Text className='signal-text'>{s.text}</Text>
              <Text className='signal-day'>{shortDay(s.day)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
