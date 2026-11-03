import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Request } from "express";

// Augmentation must be in an ambient context (no top-level import) to apply
// globally; otherwise only this file's `Request` sees the extra field - PreYem
declare global {
  namespace Express {
    interface Request {
      loggedProvider?: string;
    }
  }
}

// Cap must cover a full 90-day window (~280 fake entries), otherwise loading
// the log truncates older days off the stats page - PreYem
export const MAX_ENTRIES = 500;
const BODY_PREVIEW_LENGTH = 50;

export interface RequestLogEntry {
  id: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  status: number;
  provider?: string;
  post: {
    title: string;
    bodyPreview: string;
    wordCount: number;
    subreddit: string;
    author: string;
  } | null;
}

const dataDir = path.join(process.cwd(), "data");
const filePath = path.join(dataDir, "request-log.json");

interface DailyCounters {
  day: string;
  server: number;
  perIp: Record<string, number>;
}

let entries: RequestLogEntry[] = [];
let dailyCounters: DailyCounters = { day: "", server: 0, perIp: {} };
let writeQueue: Promise<void> = Promise.resolve();

function ensureFile(): void {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ entries: [], dailyCounters }, null, 2));
  }
}

function loadEntries(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { entries?: RequestLogEntry[]; dailyCounters?: DailyCounters };
    entries = Array.isArray(raw.entries) ? raw.entries.slice(-MAX_ENTRIES) : [];
    dailyCounters = raw.dailyCounters ?? { day: "", server: 0, perIp: {} };
    const today = new Date().toISOString().slice(0, 10);
    if (dailyCounters.day !== today) {
      dailyCounters = { day: today, server: 0, perIp: {} };
    }
  } catch {
    console.warn("[RequestLog] Could not read existing log file, starting fresh");
    entries = [];
    dailyCounters = { day: new Date().toISOString().slice(0, 10), server: 0, perIp: {} };
  }
}

function persist(): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify({ entries, dailyCounters }, null, 2), (err) => {
      if (err) {
        console.error("[RequestLog] Failed to persist log:", err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function initRequestLog(): void {
  ensureFile();
  loadEntries();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rolloverDay(): void {
  const d = today();
  if (dailyCounters.day !== d) {
    dailyCounters = { day: d, server: 0, perIp: {} };
    console.log(`[RequestLog] Daily quota counters reset for ${d}`);
  }
}

export function getServerDailyCount(): number {
  rolloverDay();
  return dailyCounters.server;
}

export function getIpDailyCount(ip: string): number {
  rolloverDay();
  return dailyCounters.perIp[ip] ?? 0;
}

export function incrementDailyCounts(ip: string): void {
  rolloverDay();
  dailyCounters.server++;
  dailyCounters.perIp[ip] = (dailyCounters.perIp[ip] ?? 0) + 1;
}

export function decrementDailyCounts(ip: string): void {
  rolloverDay();
  dailyCounters.server = Math.max(0, dailyCounters.server - 1);
  dailyCounters.perIp[ip] = Math.max(0, (dailyCounters.perIp[ip] ?? 0) - 1);
}

export function logEntry(entry: RequestLogEntry): Promise<void> {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  // Serialize writes so two requests can't interleave and corrupt the JSON - PreYem
  writeQueue = writeQueue.then(persist);
  return writeQueue;
}

export function getEntries(): RequestLogEntry[] {
  return [...entries].reverse();
}

// Empty the in-memory log and persist an empty array so the stats page is clean.
// Daily quota counters are intentionally left untouched - PreYem
export function clearLog(): Promise<void> {
  entries = [];
  writeQueue = writeQueue.then(persist);
  return writeQueue;
}

export interface StatsData {
  count: number;
  maxEntries: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  byDay: { date: string; count: number; words: number }[];
  byHour: Record<string, number>;
  byHourStatus: Record<string, { ok: number; failed: number }>;
  byDayStatus: Record<string, { ok: number; failed: number }>;
  byStatus: Record<string, number>;
  byProvider: Record<string, number>;
  topSubreddits: { name: string; count: number }[];
  topAuthors: { name: string; count: number }[];
  topIps: { name: string; count: number }[];
  topUserAgents: { name: string; count: number }[];
  totalWords: number;
  avgWords: number;
  maxWords: number;
}

function topN(counter: Map<string, number>, n: number): { name: string; count: number }[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function shortUserAgent(ua: string): string {
  const match = ua.match(/(Chrome|Firefox|Safari|Edg|curl|node|Postman|PowerShell)[\/ ]?([\d.]*)/i);
  return match ? `${match[1]}${match[2] ? ` ${match[2].split(".")[0]}` : ""}` : ua || "unknown";
}

export function getStats(): StatsData {
  const dayCounts = new Map<string, { count: number; words: number }>();
  const hourStatusCounts = new Map<string, { ok: number; failed: number }>();
  const dayStatusCounts = new Map<string, { ok: number; failed: number }>();
  const hourCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const providerCounts = new Map<string, number>();
  const subredditCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  const uaCounts = new Map<string, number>();

  let totalWords = 0;
  let maxWords = 0;

  for (const entry of entries) {
    const day = entry.timestamp.slice(0, 10);
    const words = entry.post?.wordCount ?? 0;
    totalWords += words;
    maxWords = Math.max(maxWords, words);
    const dayEntry = dayCounts.get(day) ?? { count: 0, words: 0 };
    dayEntry.count++;
    dayEntry.words += words;
    dayCounts.set(day, dayEntry);

    const hour = entry.timestamp.slice(11, 13);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    const hourStatus = hourStatusCounts.get(hour) ?? { ok: 0, failed: 0 };
    const dayStatus = dayStatusCounts.get(day) ?? { ok: 0, failed: 0 };
    if (entry.status < 400) {
      hourStatus.ok++;
      dayStatus.ok++;
    } else {
      hourStatus.failed++;
      dayStatus.failed++;
    }
    hourStatusCounts.set(hour, hourStatus);
    dayStatusCounts.set(day, dayStatus);
    statusCounts.set(String(entry.status), (statusCounts.get(String(entry.status)) ?? 0) + 1);
    providerCounts.set(entry.provider ?? "none", (providerCounts.get(entry.provider ?? "none") ?? 0) + 1);
    if (entry.post?.subreddit) subredditCounts.set(entry.post.subreddit, (subredditCounts.get(entry.post.subreddit) ?? 0) + 1);
    if (entry.post?.author) authorCounts.set(entry.post.author, (authorCounts.get(entry.post.author) ?? 0) + 1);
    ipCounts.set(entry.ip, (ipCounts.get(entry.ip) ?? 0) + 1);
    const ua = shortUserAgent(entry.userAgent);
    uaCounts.set(ua, (uaCounts.get(ua) ?? 0) + 1);
  }

  return {
    count: entries.length,
    maxEntries: MAX_ENTRIES,
    firstTimestamp: entries.length ? entries[0].timestamp : null,
    lastTimestamp: entries.length ? entries[entries.length - 1].timestamp : null,
    byDay: [...dayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, count: v.count, words: v.words })),
    byHour: Object.fromEntries([...hourCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    byHourStatus: Object.fromEntries([...hourStatusCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    byDayStatus: Object.fromEntries([...dayStatusCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    byStatus: Object.fromEntries(statusCounts),
    byProvider: Object.fromEntries(providerCounts),
    topSubreddits: topN(subredditCounts, 10),
    topAuthors: topN(authorCounts, 10),
    topIps: topN(ipCounts, 10),
    topUserAgents: topN(uaCounts, 10),
    totalWords,
    avgWords: entries.length ? Math.round(totalWords / entries.length) : 0,
    maxWords,
  };
}

export function makeId(): string {
  return `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

export function bodyPreview(body: unknown): string {
  if (typeof body !== "string" || !body) return "";
  return body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}...` : body;
}

export function wordCount(body: unknown): number {
  if (typeof body !== "string" || !body) return 0;
  return body.split(/\s+/).filter(Boolean).length;
}

export function setProvider(request: Request, provider: string): void {
  request.loggedProvider = provider;
}
