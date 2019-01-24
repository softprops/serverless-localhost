function trap(sig: NodeJS.Signals): Promise<NodeJS.Signals> {
  return new Promise(resolve => {
    process.on(sig, () => resolve(sig));
  });
}

export function trapAll(): Promise<NodeJS.Signals> {
  return Promise.race([trap('SIGINT'), trap('SIGTERM')]);
}
