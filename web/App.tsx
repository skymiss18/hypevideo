import { useEffect, useRef, useState } from "react";
import { money, percent } from "../shared/format";
import { ADDRESS_RE, type JobInfo, type VideoLanguage } from "../shared/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export const App: React.FC = () => {
  const [address, setAddress] = useState("");
  const [hide, setHide] = useState(false);
  const [tts, setTts] = useState(true);
  const [language, setLanguage] = useState<VideoLanguage>("en");
  const [seconds, setSeconds] = useState(120);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const active = !!job && job.status !== "done" && job.status !== "error";

  useEffect(() => {
    if (!job || !active) return;
    timer.current = window.setInterval(async () => {
      try {
        setJob(await api<JobInfo>(`/api/jobs/${job.id}`));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1000);
    return () => window.clearInterval(timer.current);
  }, [job?.id, active]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = address.trim();
    if (!ADDRESS_RE.test(trimmed)) {
      setError("Enter a valid 42-character address starting with 0x.");
      return;
    }
    try {
      setJob(
        await api<JobInfo>("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: trimmed, hideAmounts: hide, targetSeconds: seconds, tts, language }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main>
      <h1>
        Hyperliquid <span>PnL Journey</span>
      </h1>
      <p className="sub">Paste any wallet address and get a narrated video of its trading history.</p>

      <form onSubmit={submit}>
        <div className="row">
          <input type="text" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} />
          <button type="submit" disabled={active}>
            Generate
          </button>
        </div>
        <div className="options">
          <label>
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            Hide dollar amounts
          </label>
          <label>
            <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} />
            Voice narration
          <label>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as VideoLanguage)}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          </label>
          <label>
            Length
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              <option value={60}>~1 min</option>
              <option value={120}>~2 min</option>
              <option value={180}>~3 min</option>
            </select>
          </label>
        </div>
      </form>

      {error && <div className="error">{error}</div>}
      {job?.status === "error" && <div className="error">{job.error}</div>}

      {job && job.status !== "error" && (
        <div className="card">
          {job.stats && (
            <div className="stats">
              <div className="stat">
                <small>Total PnL</small>
                <b className={job.stats.totalPnl >= 0 ? "pos" : "neg"}>{money(job.stats.totalPnl, hide, { sign: true })}</b>
              </div>
              <div className="stat">
                <small>Trades</small>
                <b>{job.stats.tradeCount.toLocaleString("en-US")}</b>
              </div>
              <div className="stat">
                <small>Win rate</small>
                <b>{percent(job.stats.winRate)}</b>
              </div>
              <div className="stat">
                <small>Liquidations</small>
                <b>{job.stats.liquidations}</b>
              </div>
            </div>
          )}

          {job.status === "done" && job.videoUrl ? (
            <>
              <video src={job.videoUrl} controls />
              <a className="download" href={job.videoUrl} download={`hyperliquid-${job.address.slice(0, 8)}.mp4`}>
                Download MP4
              </a>
            </>
          ) : (
            <>
              <div>{job.message}</div>
              <div className="bar">
                <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
};
