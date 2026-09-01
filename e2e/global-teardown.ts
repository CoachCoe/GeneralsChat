export default async function globalTeardown() {
  await new Promise<void>((resolve) => {
    const server = globalThis.__claudeStub;
    if (!server) return resolve();
    server.close(() => resolve());
  });
}
