import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Cover } from "@/components/ui/cover";
import { CustomCursor } from "@/components/ui/custom-cursor";

type Page = "projects" | "info" | "radio";

/**
 * ⭐ 电台入口（预留口子）
 * ------------------------------------------------------------------
 * 后期 Codex 把 TuneChat 电台（Redio/ai-radio 全栈应用）部署到同域名
 * 的 /app/ 子路径后，这里点击即可在新标签页进入电台。
 *
 * 约定（给 Codex / 部署时看）：
 *   - 官网：       https://<域名>/         → 本静态站
 *   - 电台前端：   https://<域名>/app/      → ai-radio 构建产物
 *   - 电台后端 API：https://<域名>/api/*      → Nginx 反代到 Node 服务
 * 若将来改成子域名（如 app.<域名>），只需改这里的 APP_URL 一处。
 */
const APP_URL = "/app/";
function enterApp() {
  window.open(APP_URL, "_blank", "noopener,noreferrer");
}

// 统一的下划线链接样式：hover 时黑线从左滑出；active 时常驻
function navLinkClass(active: boolean) {
  return [
    "relative inline-block after:absolute after:left-0 after:-bottom-[2px]",
    "after:h-[1.5px] after:w-full after:bg-black after:origin-left",
    active ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100",
    "after:transition-transform after:duration-300 after:ease-out",
  ].join(" ");
}

function NavBar({ page, go }: { page: Page; go: (p: Page) => void }) {
  return (
    <header className="w-full h-[4.5rem] bg-transparent flex items-center justify-between px-[1.5rem]">
      <div className="flex items-center gap-[2rem]">
        {/* Logo 点击回主页（TuneChat/Hero） */}
        <button
          onClick={() => go("radio")}
          data-cursor="link"
          aria-label="instruckt logo"
          className="w-[5.85rem] h-[1.5rem] bg-black rounded-[2px] block"
        />
        <nav className="flex items-center gap-[1rem] text-[1rem] font-[590] text-black leading-none">
          <button data-cursor="link" onClick={() => go("projects")} className={navLinkClass(page === "projects")}>Projects</button>
          <button data-cursor="link" onClick={() => go("info")} className={navLinkClass(page === "info")}>Info</button>
          {/* TuneChat tab：默认选中，显示 Hero（不再是电台入口） */}
          <button data-cursor="link" onClick={() => go("radio")} className={navLinkClass(page === "radio")}>TuneChat</button>
        </nav>
      </div>
      <div className="flex items-center gap-[2px] text-[1rem] font-[590] leading-none">
        <a href="#" data-cursor="link" className={navLinkClass(true)}>En</a>
        <span className="text-neutral-500 mx-[3px]">/</span>
        <a href="#" data-cursor="link" className={"text-neutral-500 hover:text-black transition-colors " + navLinkClass(false)}>中文</a>
      </div>
    </header>
  );
}

// 首页 Hero —— 点击发光的 "TuneChat" 也进入电台
function Hero() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center px-[1.5rem] -mt-[4.5rem]">
      <h1 className="text-center font-[590] leading-[1.0] tracking-tight text-[3rem] md:text-[3.875rem]">
        <span className="text-[#383838] block">Play the music you feel</span>
        <span className="block mt-2">
          <span className="text-[#383838]">at </span>
          {/* ⭐ 点击这个动效 TuneChat 在新标签页进入电台 /app/（唯一入口） */}
          <Cover onClick={enterApp}>TuneChat</Cover>
        </span>
      </h1>
    </section>
  );
}

// 内页占位（居中文字）
function Placeholder({ title }: { title: string }) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center px-[1.5rem] -mt-[4.5rem]">
      <h1 className="text-center font-[590] text-[#383838] text-[3rem] md:text-[3.875rem] leading-[1.0]">
        {title}
      </h1>
      <p className="mt-4 text-[1rem] text-neutral-500">Building…</p>
    </section>
  );
}

// 底部备案信息（合规展示：工信部 ICP + 后续公安备案）
function Footer() {
  return (
    <footer className="w-full py-[1.25rem] px-[1.5rem] flex items-center justify-center gap-[1rem] text-[0.7rem] text-neutral-400">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        data-cursor="link"
        className="hover:text-neutral-600 transition-colors"
      >
        皖ICP备2026023953号
      </a>
      {/*
        公安备案（待办下来后启用）：
        拿到“皖公网安备 34xxxxxxxxxxxx号”后，把下方注释打开并填入号码与 code 参数。
        图标可放 /beian-police.png（从 beian.mps.gov.cn 下载警徽）。
      <a
        href="https://beian.mps.gov.cn/#/query/webSearch?code=34xxxxxxxxxxxx"
        target="_blank"
        rel="noreferrer"
        data-cursor="link"
        className="hover:text-neutral-600 transition-colors flex items-center gap-1"
      >
        <img src="/beian-police.png" alt="" className="w-[0.9rem] h-[0.9rem]" />
        皖公网安备 34xxxxxxxxxxxx号
      </a>
      */}
    </footer>
  );
}

function App() {
  const [page, setPage] = useState<Page>("radio");

  return (
    <div className="min-h-screen w-full flex flex-col bg-transparent">
      <CustomCursor />
      <NavBar page={page} go={setPage} />
      {page === "radio" && <Hero />}
      {page === "projects" && <Placeholder title="Projects" />}
      {page === "info" && <Placeholder title="Info" />}
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
