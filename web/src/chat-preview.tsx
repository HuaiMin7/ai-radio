import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { ChatWindow } from "./App";

/**
 * 聊天气泡 UI 预览页（仅开发用，不进生产构建）。
 *
 * 直接复用线上真实的 ChatWindow 组件，只喂本地假数据，
 * 免登录即可对照 Figma 设计稿核对气泡样式。
 *
 * 设计稿：Figma node 338-648 / 338-781（瞬应未来）
 * 访问：/tilt-preview.html
 */

const now = new Date();
const iso = (minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * 60000).toISOString();

const demoMessages = [
  {
    createdAt: iso(6),
    id: "m1",
    role: "user" as const,
    text: "哈喽，给我推荐一些歌曲"
  },
  {
    createdAt: iso(5),
    id: "m2",
    role: "assistant" as const,
    text: "好呀，先告诉我你现在的心情？下班放松还是需要专注？"
  },
  {
    createdAt: iso(3),
    id: "m3",
    role: "user" as const,
    text: "随便听听我感兴趣的歌"
  }
];

function Preview() {
  const [message, setMessage] = useState("");
  const [isPlanning, setIsPlanning] = useState(true);

  return (
    <div
      style={{
        alignItems: "center",
        background:
          "radial-gradient(120% 120% at 50% 0%, #1b1b22 0%, #0a0a0c 60%, #050506 100%)",
        display: "flex",
        height: "100dvh",
        justifyContent: "center",
        position: "relative"
      }}
    >
      <div style={{ height: 788, position: "relative", width: 600 }}>
        <ChatWindow
          error={null}
          isLandingChat
          isLoading={false}
          isPlanning={isPlanning}
          message={message}
          messages={demoMessages}
          onClose={() => {}}
          onMessageAnimationComplete={() => {}}
          onMessageChange={setMessage}
          onOpenAgentProfile={() => {}}
          onSend={() => {}}
          plan={null}
          planningInputText="正在为你挑选…"
          planningText="正在挑选适合你的歌"
        />
      </div>

      <button
        onClick={() => setIsPlanning((v) => !v)}
        style={{
          background: isPlanning ? "#238636" : "#21212a",
          border: "1px solid #2a2a33",
          borderRadius: 8,
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          left: 16,
          padding: "8px 12px",
          position: "fixed",
          top: 16,
          zIndex: 9999
        }}
        type="button"
      >
        {isPlanning ? "● 挑选中（开）" : "○ 挑选中（关）"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
