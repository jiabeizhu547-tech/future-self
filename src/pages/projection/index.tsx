import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useCallback, useState } from 'react';

import { calibratePath } from '@/ai/calibrate';
import { getCalibration, getEntry, getProjection, saveCalibration, setPathStance } from '@/services/storage';
import { CalibrationInsight, FuturePath, Projection, Stance } from '@/types/models';
import { formatDayLabel, nowMs } from '@/utils/date';

import './index.scss';

function valenceTag(v: number | null): { text: string; color: string } {
  if (v == null) return { text: '', color: '#8a8f99' };
  if (v >= 0.3) return { text: '偏想要', color: '#34c759' };
  if (v <= -0.3) return { text: '需警惕', color: '#ff9500' };
  return { text: '中性', color: '#8a8f99' };
}

const STANCE_LABEL: Record<Stance, string> = {
  want: '✓ 想要',
  dont_want: '✕ 不想要',
  neutral: '— 说不好',
};

const STANCE_COLOR: Record<Stance, string> = {
  want: '#34c759',
  dont_want: '#ff9500',
  neutral: '#8a8f99',
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '容易',
  medium: '中等',
  hard: '需努力',
};

export default function ProjectionDetail() {
  const router = useRouter();
  const id = router.params.id || '';

  // v13 安全模式：渲染时同步读取
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const proj = getProjection(id);

  // 校准状态：首次渲染时从缓存加载已有校准
  const [calibMap, setCalibMap] = useState<
    Record<number, CalibrationInsight | 'loading' | null>
  >(() => {
    if (!proj) return {};
    const loaded: Record<number, CalibrationInsight | null> = {};
    proj.paths.forEach((_, i) => {
      const cached = getCalibration(proj.id, i);
      if (cached) loaded[i] = cached;
    });
    return loaded;
  });

  async function handleStance(pathIndex: number, stance: Stance) {
    if (!proj) return;

    // 再点同一个 = 取消回中立
    const cur = proj.stances?.[pathIndex];
    const next: Stance = cur === stance ? 'neutral' : stance;

    setPathStance(proj.id, pathIndex, next);
    refresh();

    // 中立不需要校准
    if (next === 'neutral') {
      const insight: CalibrationInsight = {
        projection_id: proj.id,
        path_index: pathIndex,
        stance: 'neutral',
        signal_hits: [],
        adjustments: [],
        early_signal_defs: [],
        summary: '',
        created_at: nowMs(),
      };
      saveCalibration(insight);
      setCalibMap((prev) => ({ ...prev, [pathIndex]: insight }));
      return;
    }

    // 触发校准
    setCalibMap((prev) => ({ ...prev, [pathIndex]: 'loading' }));
    Taro.showToast({ title: '正在校准…', icon: 'loading', duration: 5000 });

    try {
      const insight = await calibratePath(proj.paths[pathIndex], pathIndex, next, proj.id);
      Taro.hideToast();
      saveCalibration(insight);
      setCalibMap((prev) => ({ ...prev, [pathIndex]: insight }));
    } catch (e: any) {
      Taro.hideToast();
      console.error('[proj] calibrate error:', e);
      setCalibMap((prev) => ({
        ...prev,
        [pathIndex]: {
          projection_id: proj.id,
          path_index: pathIndex,
          stance: next,
          signal_hits: [],
          adjustments: [],
          early_signal_defs: [],
          summary: '校准分析失败：' + (e.message || '未知错误'),
          created_at: nowMs(),
        },
      }));
      Taro.showToast({ title: '校准失败，请重试', icon: 'none', duration: 2000 });
    }
  }

  function openSeed(entryId: string) {
    const e = getEntry(entryId);
    if (!e) {
      Taro.showToast({ title: '这条记录已不在', icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: `/pages/detail/index?id=${entryId}` });
  }

  if (!proj) {
    return (
      <View className='page'>
        <View className='empty'>没找到这次推演。</View>
      </View>
    );
  }

  return (
    <View className='page'>
      {/* 头部 */}
      <View className='card head-card'>
        <Text className='head-horizon'>
          {String(proj.horizon_years)} 年后 · {String(proj.paths.length)} 条可能
        </Text>
        {proj.summary ? <Text className='head-summary'>{proj.summary}</Text> : null}
        <Text className='head-meta'>
          基于 {proj.window_start} ~ {proj.window_end} 的 {String(proj.entry_count)} 条记录
        </Text>
      </View>

      {/* 路径卡 */}
      {proj.paths.map((p: FuturePath, i: number) => {
        const vt = valenceTag(p.valence_guess);
        const stance: Stance = proj.stances?.[i] ?? 'neutral';
        const calib = calibMap[i];

        return (
          <View className='card path-card' key={i}>
            {/* 路径头 */}
            <View className='path-head'>
              <Text className='path-title'>{p.title}</Text>
              {vt.text ? (
                <Text className='path-vtag' style={{ color: vt.color }}>
                  {vt.text}
                </Text>
              ) : null}
            </View>

            {p.narrative ? <Text className='path-narrative'>{p.narrative}</Text> : null}

            {/* 驱动因素 */}
            {p.drivers.length > 0 ? (
              <View className='path-drivers'>
                <Text className='drivers-label'>推动因素</Text>
                {p.drivers.map((d, di) => (
                  <Text className='driver' key={di}>
                    · {d}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* 来源记录 */}
            {p.seed_entry_ids.length > 0 ? (
              <View className='path-seeds'>
                <Text className='seeds-label'>来自这些记录:</Text>
                <View className='seeds-row'>
                  {p.seed_entry_ids.map((sid) => {
                    const e = getEntry(sid);
                    return (
                      <Text className='seed-chip' key={sid} onClick={() => openSeed(sid)}>
                        {e ? formatDayLabel(e.day) : '已删除'}
                      </Text>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* 立场按钮 */}
            <View className='stance-row'>
              {(['want', 'dont_want', 'neutral'] as Stance[]).map((s) => (
                <View
                  key={s}
                  className={`stance-btn ${stance === s ? 'active ' + s : ''}`}
                  onClick={() => handleStance(i, s)}
                >
                  <Text>{STANCE_LABEL[s]}</Text>
                </View>
              ))}
            </View>

            {/* 校准洞察 */}
            {calib && calib !== 'loading' ? (
              <View className='calib-box'>
                {/* 立场标签 */}
                <View className='calib-stance' style={{ color: STANCE_COLOR[calib.stance] }}>
                  {STANCE_LABEL[calib.stance]}
                </View>

                {/* 信号扫描 */}
                {calib.signal_hits.length > 0 ? (
                  <View className='calib-signals'>
                    <Text className='calib-label'>
                      🔍 信号扫描（{String(calib.signal_hits.length)} 个）
                    </Text>
                    {calib.signal_hits.map((h, hi) => {
                      const isWanted = h.direction === 'toward_wanted';
                      const isUnwanted = h.direction === 'toward_unwanted';
                      return (
                        <View
                          className={`signal-chip ${isWanted ? 'good' : ''} ${isUnwanted ? 'bad' : ''}`}
                          key={hi}
                          onClick={() => {
                            if (h.example_entry_ids[0]) openSeed(h.example_entry_ids[0]);
                          }}
                        >
                          <Text className='signal-icon'>
                            {isWanted ? '↗' : isUnwanted ? '↘' : '·'}
                          </Text>
                          <Text className='signal-text'>
                            {h.signal} ×{String(h.count)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View className='calib-signals'>
                    <Text className='calib-label'>🔍 信号扫描</Text>
                    <Text className='calib-muted'>近期记录中尚未发现明显匹配信号。</Text>
                  </View>
                )}

                {/* 微调建议（想要） */}
                {calib.adjustments.length > 0 ? (
                  <View className='calib-adjustments'>
                    <Text className='calib-label'>🎯 微调建议</Text>
                    {calib.adjustments.map((a, ai) => (
                      <View className='adjustment-item' key={ai}>
                        <View className='adjustment-head'>
                          <Text className='adjustment-what'>{a.what}</Text>
                          <Text className={`adjustment-diff ${a.difficulty}`}>
                            {DIFFICULTY_LABEL[a.difficulty]}
                          </Text>
                        </View>
                        {a.why ? <Text className='adjustment-why'>{a.why}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* 早期预警信号（不想要） */}
                {calib.early_signal_defs.length > 0 ? (
                  <View className='calib-warnings'>
                    <Text className='calib-label'>⚠️ 早期预警信号</Text>
                    {calib.early_signal_defs.map((w, wi) => (
                      <View className='warning-item' key={wi}>
                        <Text className='warning-signal'>⚡ {w.signal}</Text>
                        {w.interpretation ? (
                          <Text className='warning-interpretation'>{w.interpretation}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* 总结 */}
                {calib.summary ? <Text className='calib-summary'>{calib.summary}</Text> : null}
              </View>
            ) : null}

            {calib === 'loading' ? (
              <View className='calib-loading'>
                <Text className='calib-loading-text'>正在分析校准…</Text>
              </View>
            ) : null}
          </View>
        );
      })}

      <Text className='foot-hint'>
        标记「想要」→ 反推当下可微调的事。{'\n'}标记「不想要」→ 识别该警惕的早期信号。
      </Text>
    </View>
  );
}
