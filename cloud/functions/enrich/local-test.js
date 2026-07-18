// 本地试跑 enrich:不用注册/不用云开发,直接在你电脑上调 DeepSeek 看分析结果。
// 用法(在 future-self-mp 目录下执行):
//   node cloud/functions/enrich/local-test.js "你的DeepSeekKey" "要分析的一段话"
// 第二个参数不填就用下面这条示例。

const key = process.argv[2];
const text =
  process.argv[3] ||
  '今天又加班到十点,项目一点进展都没有,感觉再这样下去人要废了,但也不知道能改变什么。';

if (!key) {
  console.error('用法: node cloud/functions/enrich/local-test.js "你的DeepSeekKey" "要分析的一段话"');
  process.exit(1);
}

process.env.DEEPSEEK_KEY = key;
const { main } = require('./index.js');

console.log('正在分析:', text, '\n');
main({ content: text })
  .then((res) => {
    console.log(JSON.stringify(res, null, 2));
  })
  .catch((e) => {
    console.error('出错了:', e);
  });
