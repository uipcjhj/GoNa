"use client";
import { useState } from "react";
import { Radar } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) window.location.href = new URLSearchParams(window.location.search).get("next") || "/";
    else setErr((await r.json()).error ?? "로그인 실패");
  }
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center gap-2"><Radar className="h-5 w-5 text-sky-600" /><b>Global Opportunity Radar</b></div>
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" placeholder="접속 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          {err && <div className="text-sm text-red-600">{err}</div>}
          <Button type="submit" className="w-full">로그인</Button>
        </form>
        <p className="mt-3 text-[11px] text-slate-400">내부 업무용 시스템입니다. 비밀번호는 관리자가 환경변수 APP_PASSWORD로 설정합니다.</p>
      </Card>
    </div>
  );
}
