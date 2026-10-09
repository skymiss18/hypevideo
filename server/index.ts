import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { z } from "zod";
import { ADDRESS_RE, type JobInfo, type JobOptions } from "../shared/types";
import { jobsDir } from "./cache.js";
import { HyperliquidError } from "./hyperliquid/client.js";
import { runPipeline, UserFacingError } from "./pipeline.js";

const PORT = Number(process.env.PORT ?? 3001);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MAX_QUEUED = 5;

const jobs = new Map<string, JobInfo>();
let chain: Promise<void> = Promise.resolve();
let pending = 0;

const body = z.object({
  address: z.string().trim().regex(ADDRESS_RE, "Enter a 42-character 0x address"),
  hideAmounts: z.boolean().default(false),
  targetSeconds: z.number().min(60).max(180).default(120),
  tts: z.boolean().default(true),
});

function friendlyError(e: unknown): string {
  if (e instanceof UserFacingError || e instanceof HyperliquidError) return e.message;
  if (e instanceof Error && /no hyperliquid account/i.test(e.message)) return e.message;
  console.error(e);
  return `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
}

function enqueue(job: JobInfo, options: JobOptions) {
  pending++;
  chain = chain.then(async () => {
    const update = (patch: Partial<JobInfo>) => Object.assign(job, patch);
    try {
      const result = await runPipeline(
        job.id,
        job.address,
        options,
        BASE_URL,
        (status, progress, message) => update({ status, progress, message }),
        (storyboard, stats) => update({ storyboard, stats }),
      );
      update({
        status: "done",
        progress: 1,
        message: "Done",
        storyboard: result.storyboard,
        stats: result.stats,
        videoUrl: `/files/${job.id}/journey.mp4`,
      });
    } catch (e) {
      update({ status: "error", message: "Failed", error: friendlyError(e) });
    } finally {
      pending--;
    }
  });
}

const app = Fastify({ logger: { level: "warn" } });
await app.register(cors);

app.post("/api/jobs", async (req, reply) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  if (pending >= MAX_QUEUED) return reply.code(429).send({ error: "Too many jobs queued. Try again shortly." });

  const { address, ...options } = parsed.data;
  const job: JobInfo = {
    id: randomUUID(),
    address: address.toLowerCase(),
    status: "queued",
    progress: 0,
    message: pending > 0 ? "Waiting in queue" : "Starting",
  };
  jobs.set(job.id, job);
  enqueue(job, options);
  return job;
});

app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
  const job = jobs.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  return job;
});

await mkdir(jobsDir, { recursive: true });
await app.register(fastifyStatic, { root: jobsDir, prefix: "/files/", decorateReply: false, acceptRanges: true });

const webDist = path.resolve(import.meta.dirname, "../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: "/", decorateReply: false });
}

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`API listening on ${BASE_URL}`);
