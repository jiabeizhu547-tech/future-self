import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.scss'

/** 云开发环境 ID（在微信云开发控制台获取，部署云函数后替换） */
const CLOUD_ENV = 'your-env-id';

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    // 初始化云开发（部署云函数后取消注释并填入真实 envId）
    if (CLOUD_ENV !== 'your-env-id') {
      try {
        Taro.cloud.init({ env: CLOUD_ENV });
      } catch (e) {
        console.warn('[app] cloud init failed:', e);
      }
    }
    console.log('App launched.');
  })

  return children
}
  


export default App
