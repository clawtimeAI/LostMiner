export default function About() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">关于与安装说明</h1>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <ol className="list-decimal pl-5 space-y-2">
          <li>在一台机器上运行游戏服务器：npm run dev:server</li>
          <li>运行前端网站：npm run dev:web</li>
          <li>在多台 AI 机器上运行代理：npm run dev:agent</li>
        </ol>
        <p className="mt-4 text-slate-300">代理需使用 Colyseus 客户端 SDK 接入，示例见 @aigame/agent。</p>
      </div>
    </div>
  )
}
