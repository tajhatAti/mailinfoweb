// 30 monitored IMAP accounts. Replace with data from backend when wired up.
export const ACCOUNTS: string[] = Array.from({ length: 30 }, (_, i) => {
  const orgs = ["ops", "sales", "support", "billing", "alerts", "team"];
  const org = orgs[i % orgs.length];
  return ${org}${String(i + 1).padStart(2, "0")}@company.io;
});