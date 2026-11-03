export type QuotaWindow = { label: string; usedPercent: number; resetsAt?: string };
export type QuotaResult = { balance?: string; plan?: string; detail: string; windows: QuotaWindow[] };
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function parseProviderQuota(provider: string, body: any): QuotaResult {
  if (provider === 'zhipu' || provider === 'zai') {
    if (body?.success === false || !body?.data || !Array.isArray(body.data.limits)) throw new Error('Quota request failed. Check your Coding Plan and API key.');
    const d = body.data;
    const windows: QuotaWindow[] = d.limits.filter((w: any) => ['TOKENS_LIMIT', 'CREDIT_LIMIT', 'TIME_LIMIT'].includes(String(w.type).toUpperCase())).map((w: any) => {
      const used = number(w.percentage) ? w.percentage : number(w.currentValue) && number(w.usage) && w.usage > 0 ? w.currentValue / w.usage * 100 : null;
      if (used === null || used < 0 || used > 100) throw new Error('Quota response is missing valid usage. Please refresh later.');
      const label = String(w.type).toUpperCase() === 'TIME_LIMIT' ? 'MCP · Monthly' : w.unit === 6 ? '7d' : w.unit === 3 ? `${number(w.number) && w.number > 0 ? w.number : 5}h` : !w.unit && w.type === 'TOKENS_LIMIT' ? '5h' : 'Plan usage';
      const reset = number(w.nextResetTime) && w.nextResetTime > 0 ? new Date(w.nextResetTime) : null;
      return {label, usedPercent: used, ...(reset && Number.isFinite(reset.getTime()) ? {resetsAt: reset.toISOString()} : {})};
    });
    if (d.limits.length && !windows.length) throw new Error('Quota response contains unsupported window types');
    const level = typeof d.level === 'string' ? d.level.slice(0, 60) : '';
    return {plan: level ? `GLM Coding ${level}` : 'GLM Coding Plan', detail: windows.length ? 'Plan usage · Percentage used' : 'No plan usage returned. Check that this key has a Coding Plan.', windows};
  }
  if (provider === 'deepseek') {
    if (!Array.isArray(body?.balance_infos) || !body.balance_infos.length) throw new Error('Invalid quota response');
    const parts = body.balance_infos.map((b: any) => {
      if (!['USD', 'CNY'].includes(b.currency) || !Number.isFinite(Number(b.total_balance))) throw new Error('Balance data is unavailable');
      return `${b.currency === 'USD' ? '$' : '¥'}${Number(b.total_balance).toFixed(2)}`;
    });
    return { balance: parts.join(' / '), detail: body.is_available ? 'Available API balance · Includes credits' : 'Balance is not available for API calls', windows: [] };
  }
  if (provider === 'openrouter') {
    const d = body?.data;
    if (!d || !number(d.usage)) throw new Error('Invalid quota response');
    const windows: QuotaWindow[] = [];
    if (number(d.limit) && d.limit > 0 && number(d.limit_remaining)) windows.push({label: d.limit_reset || 'Key limit', usedPercent: Math.max(0, Math.min(100, 100 * (1 - d.limit_remaining / d.limit)))});
    return { balance: number(d.limit_remaining) ? `$${d.limit_remaining.toFixed(2)}` : undefined,
      detail: `${number(d.limit_remaining) ? 'Remaining key allowance' : 'Unlimited key · Account balance unknown'} · Total spent $${d.usage.toFixed(2)}`, windows };
  }
  throw new Error('Unsupported provider');
}
