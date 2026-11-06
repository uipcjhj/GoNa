// Runs once at server start. If an outbound HTTP(S) proxy is configured (corporate network, sandbox),
// route server-side fetch() through it. No effect on Vercel where no proxy variables are set.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.HTTPS_PROXY && !process.env.https_proxy) return;
  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
