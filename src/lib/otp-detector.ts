/** OTP / Verification Code Detector */

export interface DetectedCode {
  value: string;
  label: string;
}

const KEYWORDS: Record<string, number> = {
  otp: 10, "one.time": 10, verification: 8, verify: 7,
  code: 5, password: 5, passcode: 8, pin: 4,
  login: 3, "sign.in": 3, confirm: 3, token: 6,
  "2fa": 9, "two.factor": 9, "security code": 8,
  "access code": 8, telegram: 4,
};

const PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(\d{6})\b/g, label: "OTP" },
  { re: /\b(\d{4})\b/g, label: "PIN" },
  { re: /\b(\d{5})\b/g, label: "Code" },
  { re: /\b(\d{8})\b/g, label: "Code" },
  { re: /\b([A-Z0-9]{6})\b/g, label: "Code" },
];

const SKIP = new Set(["2024", "2025", "2026", "0000", "000000", "1111", "2222",
  "3333", "4444", "5555", "6666", "7777", "8888", "9999", "111111", "222222"]);

export function detectOTP(text: string): DetectedCode | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const matches: Array<{ value: string; label: string; score: number }> = [];

  for (const { re, label } of PATTERNS) {
    const r = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      const val = m[1];
      if (SKIP.has(val)) continue;
      if (/^0+$/.test(val)) continue;
      let score = 0;
      const ctx = lower.slice(Math.max(0, m.index - 60), m.index + val.length + 60);
      for (const [kw, w] of Object.entries(KEYWORDS)) {
        if (ctx.includes(kw)) score += w;
      }
      matches.push({ value: val, label, score });
    }
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  return { value: best.value, label: best.score >= 3 ? best.label : "Code" };
}

export function hasOTP(text: string): boolean {
  return detectOTP(text) !== null;
}
