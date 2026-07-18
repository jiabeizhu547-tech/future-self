import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { checkCloudReady } from '@/ai/client';
import { clearApiKey, getApiKey, hasApiKey, setApiKey } from '@/ai/enrich';
import { countEntries, exportToJson, importFromJson, listProjections } from '@/services/storage';

import './index.scss';

export default function Me() {
  const [count, setCount] = useState(0);
  const [projCount, setProjCount] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const [keySet, setKeySet] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [cloudReady, setCloudReady] = useState(false);

  useDidShow(() => {
    setCount(countEntries());
    setProjCount(listProjections().length);
    setKeySet(hasApiKey());
    checkCloudReady().then((ok) => setCloudReady(ok));
  });

  function handleSaveKey() {
    const k = keyInput.trim();
    if (!k) {
      Taro.showToast({ title: '请先粘贴 Key', icon: 'none' });
      return;
    }
    setApiKey(k);
    setKeyInput('');
    setEditingKey(false);
    setKeySet(true);
    Taro.showToast({ title: '已保存', icon: 'success' });
  }

  function handleClearKey() {
    Taro.showModal({
      title: '移除 DeepSeek Key?',
      content: '移除后新记录不再自动分析,已有的分析结果仍保留。',
      confirmText: '移除',
      confirmColor: '#ff3b30',
      success: (res) => {
        if (res.confirm) {
          clearApiKey();
          setKeySet(false);
          setEditingKey(false);
        }
      },
    });
  }

  function handleExport() {
    const n = countEntries();
    const pn = listProjections().length;
    if (n === 0 && pn === 0) {
      Taro.showToast({ title: '还没有数据可备份', icon: 'none' });
      return;
    }
    const json = exportToJson();
    Taro.setClipboardData({
      data: json,
      success: () => {
        const parts = [`${n} 条记录`];
        if (pn > 0) parts.push(`${pn} 次推演`);
        Taro.showModal({
          title: '✅ 已复制备份',
          content: `${parts.join(' + ')}（含 AI 分析、校准）已复制到剪贴板。粘到微信「文件传输助手」或备忘录存好，以后清了缓存也能从「从旧版导入」贴回来。`,
          showCancel: false,
        });
      },
      fail: () => {
        Taro.showToast({ title: '复制失败，请重试', icon: 'none' });
      },
    });
  }

  function handleImport() {
    const text = importText.trim();
    if (!text) {
      Taro.showToast({ title: '请先粘贴内容', icon: 'none' });
      return;
    }
    const res = importFromJson(text);
    if (res.error) {
      Taro.showModal({ title: '导入失败', content: res.error, showCancel: false });
      return;
    }
    setCount(countEntries());
    setProjCount(listProjections().length);
    setImportText('');
    setShowImport(false);
    const parts = [`新增 ${res.imported} 条记录`];
    if (res.skipped) parts.push(`跳过重复 ${res.skipped} 条`);
    if (res.projImported) parts.push(`导入 ${res.projImported} 次推演`);
    if (res.calibImported) parts.push(`导入 ${res.calibImported} 条校准`);
    Taro.showModal({
      title: '✅ 导入完成',
      content: parts.join('\n') + '。回首页就能看到。',
      showCancel: false,
    });
  }

  return (
    <View className='page'>
      <View className='card stat'>
        <View className='stat-item'>
          <Text className='stat-label'>📝 记录</Text>
          <Text className='stat-value'>{count}</Text>
        </View>
        <View className='stat-item'>
          <Text className='stat-label'>🔮 推演</Text>
          <Text className='stat-value'>{projCount}</Text>
        </View>
      </View>

      {/* 备份 / 恢复 */}
      <View className='card'>
        <Text className='card-title'>💾 备份你的记录</Text>
        <Text className='muted'>
          记录只存在本机,清缓存或换设备会丢。定期点下面按钮复制一份存到「文件传输助手」,就丢不了。
        </Text>
        <Button className='save-btn' onClick={handleExport}>
          导出备份(复制到剪贴板)
        </Button>
      </View>

      {/* DeepSeek AI 分析 */}
      <View className='card'>
        <View className='key-head'>
          <Text className='card-title'>✨ DeepSeek AI 分析</Text>
          <Text className={`key-status ${cloudReady || keySet ? 'on' : ''}`}>{cloudReady ? '云函数' : keySet ? '已连接' : '未设置'}</Text>
        </View>

        {cloudReady ? (
          <Text className='muted'>
            AI 调用走云函数代理，Key 存在服务端，不会下发到客户端。无需额外配置。
          </Text>
        ) : editingKey || !keySet ? (
          <View>
            <Input
              className='key-input'
              value={keyInput}
              placeholder='粘贴 DeepSeek Key(sk-...)'
              onInput={(e) => setKeyInput(e.detail.value)}
            />
            <Button className='save-btn' onClick={handleSaveKey}>
              保存
            </Button>
            {keySet ? (
              <Text
                className='link'
                onClick={() => {
                  setEditingKey(false);
                  setKeyInput('');
                }}>
                取消
              </Text>
            ) : null}
            <Text className='muted key-tip'>
              在 platform.deepseek.com 申请充值(个人用很便宜)。Key 只存在你手机本地,不会上传给别人。
            </Text>
          </View>
        ) : (
          <View className='key-actions'>
            <Text className='link' onClick={() => setEditingKey(true)}>
              更换 Key
            </Text>
            <Text className='link danger' onClick={handleClearKey}>
              移除
            </Text>
          </View>
        )}
      </View>

      <View className='card'>
        <Text className='card-title'>📥 从旧版导入</Text>
        <Text className='muted'>
          把旧版导出的那段内容(以 {'{'} 开头的 JSON)粘进来,你以前的记录和 AI 分析会原样搬回来。重复的会自动跳过。
        </Text>
        {showImport ? (
          <View>
            <Textarea
              className='import-input'
              value={importText}
              placeholder='在这里长按粘贴导出的内容…'
              onInput={(e) => setImportText(e.detail.value)}
              maxlength={-1}
            />
            <Button className='save-btn' onClick={handleImport}>
              导入
            </Button>
            <Text
              className='link'
              onClick={() => {
                setShowImport(false);
                setImportText('');
              }}
            >
              取消
            </Text>
          </View>
        ) : (
          <Text className='link' onClick={() => setShowImport(true)}>
            展开导入
          </Text>
        )}
      </View>

      <View className='card'>
        <Text className='card-title'>🔒 关于你的数据</Text>
        <Text className='muted'>
          记录保存在你手机小程序的本地存储里。触发 AI 分析时,相关文本会临时发给 DeepSeek 用于生成结果,不会展示给其他人。
        </Text>
      </View>

      <View className='card'>
        <Text className='card-title'>这是什么</Text>
        <Text className='muted'>
          未来的我 · 人生CT——每天记录当下最琐碎的想法、感受、见闻,让 AI
          帮你看清情绪趋势,并推演出未来几种可能的人生路径,校准现在。
        </Text>
      </View>

      <Text className='version'>v0.1 · 小程序内测</Text>
    </View>
  );
}
