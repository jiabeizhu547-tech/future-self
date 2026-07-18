import { Button, Slider, Text, Textarea, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useEffect, useState } from 'react';

import { describeEnrichError, enrichEntry, hasApiKey } from '@/ai/enrich';
import { getEnrichment, getEntry, softDeleteEntry, updateEntry } from '@/services/storage';
import { Enrichment, Entry, SignalDirection } from '@/types/models';
import { formatDayLabel, formatTime } from '@/utils/date';

import './index.scss';

const MOOD_TEXT = ['很低落', '低落', '平静', '不错', '很好'];

const DIR_COLOR: Record<SignalDirection, string> = {
  toward_wanted: '#34c759',
  toward_unwanted: '#ff3b30',
  neutral: '#8a8f99',
};
const DIR_LABEL: Record<SignalDirection, string> = {
  toward_wanted: '↗ 想要',
  toward_unwanted: '↘ 警惕',
  neutral: '· 中性',
};

export default function Detail() {
  const router = useRouter();
  const id = (router.params.id as string) || '';

  const [entry, setEntry] = useState<Entry | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [content, setContent] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [mood, setMood] = useState(0);
  const [anxiety, setAnxiety] = useState(3);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const e = getEntry(id);
    setEntry(e);
    setEnrichment(getEnrichment(id));
    if (e) {
      setContent(e.content);
      setShowMeta(e.mood !== null || e.anxiety !== null);
      setMood(e.mood ?? 0);
      setAnxiety(e.anxiety ?? 3);
    }
  }, [id]);

  function handleSave() {
    if (!content.trim()) return;
    updateEntry(id, {
      content,
      mood: showMeta ? mood : null,
      anxiety: showMeta ? anxiety : null,
    });
    Taro.navigateBack();
  }

  function handleDelete() {
    Taro.showModal({
      title: '删除这条记录?',
      content: '删除后不再显示,也不参与将来的趋势与推演。',
      confirmText: '删除',
      confirmColor: '#ff3b30',
      success: (res) => {
        if (res.confirm) {
          softDeleteEntry(id);
          Taro.navigateBack();
        }
      },
    });
  }

  async function handleAnalyze() {
    if (analyzing) return;
    if (!hasApiKey()) {
      Taro.showModal({
        title: '还没设置 DeepSeek Key',
        content: '去「我的」里填一次 Key,就能让 AI 分析这条记录。',
        showCancel: false,
      });
      return;
    }
    setAnalyzing(true);
    const res = await enrichEntry(id);
    setAnalyzing(false);
    if (res.ok) {
      setEnrichment(res.enrichment);
      Taro.showToast({ title: '分析完成', icon: 'success' });
    } else {
      Taro.showModal({ title: '分析失败', content: describeEnrichError(res.error), showCancel: false });
    }
  }

  if (!entry) {
    return (
      <View className='page'>
        <Text className='muted'>记录不存在或已删除。</Text>
      </View>
    );
  }

  return (
    <View className='page'>
      <Text className='muted'>
        {formatDayLabel(entry.day)} {formatTime(entry.created_at)}
      </Text>

      <Textarea
        className='input detail-input'
        value={content}
        onInput={(e) => setContent(e.detail.value)}
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
            移除心情/焦虑标记
          </Text>
        </View>
      ) : (
        <Text className='meta-toggle' onClick={() => setShowMeta(true)}>
          ＋ 标记心情 / 焦虑
        </Text>
      )}

      <Button className='save-btn' onClick={handleSave}>
        保存修改
      </Button>

      <Button className='analyze-btn' loading={analyzing} onClick={handleAnalyze}>
        {analyzing ? '分析中…' : enrichment ? '重新分析' : '✨ 分析这条'}
      </Button>

      {/* AI 分析(有结果才展示) */}
      {enrichment ? (
        <View className='card ai-card'>
          <Text className='ai-title'>✨ AI 分析</Text>
          {enrichment.summary ? <Text className='ai-summary'>🧭 {enrichment.summary}</Text> : null}
          <View className='ai-metrics'>
            <Text className='muted'>
              效价 {fmtSigned(enrichment.valence)} · 焦虑{' '}
              {enrichment.anxiety_ai != null ? `${enrichment.anxiety_ai}/10` : '—'} · 精力{' '}
              {enrichment.energy != null ? enrichment.energy.toFixed(1) : '—'}
            </Text>
          </View>
          {enrichment.topics.length > 0 ? (
            <View className='topic-row'>
              {enrichment.topics.map((t) => (
                <Text className='chip topic' key={t}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}
          {enrichment.people.length > 0 ? (
            <Text className='muted people'>👤 {enrichment.people.join('、')}</Text>
          ) : null}
          {enrichment.signals.map((s, i) => (
            <View className='signal' key={i}>
              <Text className='signal-dir' style={{ color: DIR_COLOR[s.direction] }}>
                {DIR_LABEL[s.direction]}
              </Text>
              <Text className='muted signal-text'>{s.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className='delete-row'>
        <Text className='danger' onClick={handleDelete}>
          删除这条
        </Text>
      </View>
    </View>
  );
}

function fmtSigned(v: number | null): string {
  if (v == null) return '—';
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}
