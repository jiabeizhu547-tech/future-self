import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useCallback, useState } from 'react';

import { hasApiKey } from '@/ai/enrich';
import { countEntries, listProjections } from '@/services/storage';
import { Projection } from '@/types/models';
import { toDayString } from '@/utils/date';

import './index.scss';

export default function Future() {
  // 用 tick 做强制刷新：读 storage 在渲染阶段同步完成，不走 useEffect/useReady
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // 同步读取（渲染时直接读 storage，无竞态）
  let list: Projection[] = [];
  let entryCount = 0;
  let keyReady = false;
  try {
    list = listProjections();
    entryCount = countEntries();
    keyReady = hasApiKey();
  } catch (e: any) {
    console.error('[future] read storage error:', e.message || e);
  }

  const [busy, setBusy] = useState<number | null>(null);
  const canProject = entryCount >= 3;

  const handleGenerate = useCallback(
    async (years: number) => {
      if (busy != null) return;
      if (!hasApiKey()) {
        Taro.showModal({
          title: '还没设置 AI',
          content: '推演需要 DeepSeek Key,去「我的」里填一次即可。',
          confirmText: '去设置',
          success: (r) => {
            if (r.confirm) Taro.navigateTo({ url: '/pages/me/index' });
          },
        });
        return;
      }
      setBusy(years);
      try {
        // 动态 import：只在真正需要推演时才加载大模块
        const { projectFutures, describeProjectError } = await import('@/ai/project');
        const res = await projectFutures(years);
        setBusy(null);
        if (res.ok) {
          refresh();
          Taro.navigateTo({ url: `/pages/projection/index?id=${res.projection.id}` });
        } else {
          Taro.showModal({
            title: '推演没成功',
            content: describeProjectError(res.error),
            showCancel: false,
          });
        }
      } catch (e: any) {
        setBusy(null);
        Taro.showModal({
          title: '推演出错',
          content: e.message || '未知错误',
          showCancel: false,
        });
      }
    },
    [busy, refresh],
  );

  return (
    <View className='page'>
      {/* 推演入口 */}
      <View className='card intro-card'>
        <Text className='intro-title'>🔮 人生推演</Text>
        <Text className='intro-text'>
          让 AI 读你最近的记录,推演出几条 5 年 / 10 年后可能的人生路径。
        </Text>
        <View className='gen-row'>
          <View
            className={`gen-btn ${busy != null ? 'is-disabled' : ''}`}
            onClick={() => handleGenerate(5)}
          >
            {busy === 5 ? '推演中…' : '推演 5 年后'}
          </View>
          <View
            className={`gen-btn ${busy != null ? 'is-disabled' : ''}`}
            onClick={() => handleGenerate(10)}
          >
            {busy === 10 ? '推演中…' : '推演 10 年后'}
          </View>
        </View>
        {!keyReady ? (
          <Text className='intro-hint' onClick={() => Taro.navigateTo({ url: '/pages/me/index' })}>
            💡 还没设置 DeepSeek Key,点这里去「我的」填一次
          </Text>
        ) : !canProject ? (
          <Text className='intro-hint'>
            先记满 3 条以上,推演才有依据(现在 {String(entryCount)} 条)。
          </Text>
        ) : (
          <Text className='intro-hint muted'>
            推演会花几分钱、约十几秒;记得越多越准。
          </Text>
        )}
      </View>

      {/* 推演历史 */}
      {list.length === 0 ? (
        <View className='empty'>
          还没有推演。上面选个年限,生成你的第一次「人生CT」。
        </View>
      ) : (
        <View className='hist'>
          <Text className='hist-title'>过往推演</Text>
          {list.map((p) => (
            <View
              className='card proj-card'
              key={p.id}
              onClick={() =>
                Taro.navigateTo({ url: `/pages/projection/index?id=${p.id}` })
              }
            >
              <View className='proj-head'>
                <Text className='proj-horizon'>
                  {String(p.horizon_years ?? '?')} 年后
                </Text>
                <Text className='muted'>{toDayString(p.created_at)}</Text>
              </View>
              {p.summary ? (
                <Text className='proj-summary'>{p.summary}</Text>
              ) : null}
              <Text className='proj-meta'>
                {String(p.paths?.length ?? 0)} 条路径 · 基于{' '}
                {String(p.entry_count ?? 0)} 条记录
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
