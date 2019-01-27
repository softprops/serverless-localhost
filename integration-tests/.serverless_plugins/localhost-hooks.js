class LocalhostHooks {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      'before:localhost:start': this.before.bind(this),
      'after:localhost:start': this.after.bind(this)
    };
  }

  before() {
    this.serverless.cli.log('(localhosthooks) Before localhost:start');
  }

  after() {
    this.serverless.cli.log('(localhosthooks) After localhost:start');
  }
}

module.exports = LocalhostHooks;
