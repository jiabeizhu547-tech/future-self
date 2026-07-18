import { Button, Slider, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useCallback, useState } from 'react';

import { enrichEntry, hasApiKey } from '@/ai/enrich';
import { createEntry, getEnrichmentMap, listEntries } from '@/services/storage';
import { Enrichment, Entry } from '@/types/models';
import { formatDayLabel, formatTime } from '@/utils/date';

import './index.scss';

const MOOD_TEXT = ['很低落', '低落', '平静', '不错', '很好']; // index = mood + 2

interface DaySection {
  day: string;
  entries: Entry[];
}

function groupByDay(list: Entry[]): DaySection[] {
  const map: Record<string, Entry[]> = {};
  const order: string[] = [];
  for (const e of list) {
    if (!map[e.day]) {
      map[e.day] = [];
      order.push(e.day);
    }
    map[e.day].push(e);
  }
  return order.map((day) => ({ day, entries: map[day] }));
}

export default function Index() {
  const [content, setContent] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [mood, setMood] = useState(0); // -2..2
  const [anxiety, setAnxiety] = useState(3); // 0..10
  const [sections, setSections] = useState<DaySection[]>([]);
  const [enrichMap, setEnrichMap] = useState<Record<string, Enrichment>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [keyReady, setKeyReady] = useState(false);

  const refresh = useCallback(() => {
    setSections(groupByDay(listEntries()));
    setEnrichMap(getEnrichmentMap());
    setKeyReady(hasApiKey());
  }, []);

  useDidShow(() => {
    refresh();
  });

  async function handleSave() {
    const text = content.trim();
    if (!text) return;
    const entry = createEntry({
      content: text,
      mood: showMeta ? mood : null,
      anxiety: showMeta ? anxiety : null,
    });
    setContent('');
    setShowMeta(false);
    setMood(0);
    setAnxiety(3);
    refresh();

    // 后台 AI 分析:不阻塞记录,失败也不影响已记下的内容
    if (!hasApiKey()) return;
    setAnalyzingId(entry.id);
    const res = await enrichEntry(entry.id);
    setAnalyzingId(null);
    if (res.ok) {
      refresh();
    } else if (res.error.kind !== 'no_key') {
      Taro.showToast({ title: '这条 AI 分析失败,可进详情页重试', icon: 'none' });
    }
  }

  const canSave = content.trim().length > 0;

  return (
    <View className='page'>
      <View className='composer'>
        <Text className='hint'>此刻在想什么?哪怕最琐碎的念头也记下来。</Text>
        <Textarea
          className='input'
          value={content}
          onInput={(e) => setContent(e.detail.value)}
          placeholder='今天的一个想法、感受、观察,见了谁、什么状态…'
          autoHeight
          maxlength={-1}
        />

        {showMeta ? (
          <View className='meta'>
            <Text className='meta-label'>心情:{MOOD_TEXT[mood + 2]}</Text>
            <Slider
              min={-2}
              max={2}
              step={1}
              value={mood}
              activeColor='#34c759'
              blockSize={20}
              onChanging={(e) => setMood(e.detail.value)}
              onChange={(e) => setMood(e.detail.value)}
            />
            <Text className='meta-label'>焦虑:{anxiety}/10</Text>
            <Slider
              min={0}
              max={10}
              step={1}
              value={anxiety}
              activeColor='#ff9500'
              blockSize={20}
              onChanging={(e) => setAnxiety(e.detail.value)}
              onChange={(e) => setAnxiety(e.detail.value)}
            />
            <Text className='meta-toggle' onClick={() => setShowMeta(false)}>
              收起
            </Text>
          </View>
        ) : (
          <Text className='meta-toggle' onClick={() => setShowMeta(true)}>
            ＋ 标记心情 / 焦虑(可选)
          </Text>
        )}

        <Button
          className={`save-btn ${canSave ? '' : 'disabled'}`}
          disabled={!canSave}
          onClick={handleSave}>
          记下来
        </Button>

        <View className='me-row'>
          <Text
            className='link nav-link'
            onClick={() => Taro.navigateTo({ url: '/pages/trends/index' })}>
            📈 趋势
          </Text>
          <Text
            className='link nav-link'
            onClick={() => Taro.navigateTo({ url: '/pages/future/index' })}>
            🔮 未来
          </Text>
          <Text
            className='link nav-link'
            onClick={() => Taro.navigateTo({ url: '/pages/me/index' })}>
            我的 / 关于
          </Text>
        </View>

        {!keyReady ? (
          <Text
            className='key-hint'
            onClick={() => Taro.navigateTo({ url: '/pages/me/index' })}>
            💡 想让 AI 自动分析情绪?去「我的」填一次 DeepSeek Key
          </Text>
        ) : null}
      </View>

      {sections.length === 0 ? (
        <View className='empty'>还没有记录。上面写下第一条吧。</View>
      ) : (
        sections.map((sec) => (
          <View className='section' key={sec.day}>
            <View className='section-head'>
              <Text className='section-title'>{formatDayLabel(sec.day)}</Text>
              <Text className='muted'>{sec.entries.length} 条</Text>
            </View>
            {sec.entries.map((e) => {
              const en = enrichMap[e.id];
              return (
                <View
                  className='card entry-card'
                  key={e.id}
                  onClick={() => Taro.navigateTo({ url: `/pages/detail/index?id=${e.id}` })}>
                  <View className='card-head'>
                    <Text className='muted'>{formatTime(e.created_at)}</Text>
                    {e.anxiety !== null ? <Text className='chip'>焦虑 {e.anxiety}</Text> : null}
                  </View>
                  <Text className='card-content'>{e.content}</Text>
                  {analyzingId === e.id ? (
                    <Text className='summary analyzing'>✨ AI 分析中…</Text>
                  ) : null}
                  {en && en.topics.length > 0 ? (
                    <View className='topic-row'>
                      {en.topics.map((t) => (
                        <Text className='chip topic' key={t}>
                          {t}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {en && en.summary ? <Text className='summary'>🧭 {en.summary}</Text> : null}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}
