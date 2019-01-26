# serverless localhost [![Build Status](https://travis-ci.org/softprops/serverless-localhost.svg?branch=master)](https://travis-ci.org/softprops/serverless-localhost)

> Host any API Gateway triggerable AWS Lambda in any Lambda runtime locally with no changes to your serverless application

<img width="647" src="assets/screenshot.png"/>

## Overview

Goals

* 👩‍💻 Shorten AWS Lambda development feedback loops
* ⚡ Integrate with your existing serverless application
* ⛱️ Work with **all** AWS Lambda runtimes, out of the box
* 🐑 Leverage [lambci project](https://github.com/lambci/) for undifferentiated heaving lifting

## 📦 Install

> 💡 This plugin relies on Docker to emulate AWS Lambda runtimes. If you don't have that
installed you can learn how to [here](https://www.docker.com/products/docker-desktop)

Inside a serverless project directory run the following

```sh
$ npm i -D softprops/serverless-localhost
```

Add the `serverless-localhost` to your `serverless.yml` file's
list of `plugins`

```yaml
service: demo
provider:
  name: aws
  runtime: xxx
plugins:
  - serverless-localhost
functions:
  test:
    handler: foo.bar
    events:
      - http:
          path: /
          method: GET
```

## 🤸 Usage

Run the following in your terminal

```sh
$ npx serverless localhost
```

This will start a server listening on port `3000`

To start a server on an alternative port using the `-p` flag providing the desired
port to listen on

```sh
$ npx serverless localhost -p 3001
```

### 🌏 Environment variables
Environment variables defined in your `serverless.yml` will be made available inside
the localhost server. If your `serverless.yml` is configured to source their
values from the deployment env, i.e. `${env.FOO,''}` just export their values
before starting the server.

```sh
$ FOO=bar npx serverless localhost
```

### 👩‍🔬 Debugging applications

Serverless localhost supports running a subset of lambda runtimes in debugging mode
by starting the server with the debug flag `-d` providing a port for the runtimes debugger to listen on.

```sh
$ npx serverless localhost -d 5858
```

> 💡 Debugging is supported for the following lambda runtimes `nodejs`, `nodejs4.3`, `nodejs6.10`, `nodejs8.10`, `java8`, `python2.7`, `python3.6`, `dotnetcore2.0`, `dotnetcore2.1`

### 🔬 Debugging the plugin

If you find your having a problem with this plugin, you can run this plugin's command
with the `DEBUG` environment variable set to "localhost"

```sh
$ DEBUG=localhost npx serverless localhost
```

## 👯 Contributing

Contributions are welcome. Please read [our contributing doc](CONTRIBUTING.md) for more information.

---

🚧 Planned work

Please not this road is still being paved. The following items are planned work ahead

* add support for binary requests and responses
* debug mod for runtimes

Doug Tangren (softprops) 2019