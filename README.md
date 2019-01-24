# serverless localhost [![Build Status](https://travis-ci.org/softprops/serverless-localhost.svg?branch=master)](https://travis-ci.org/softprops/serverless-localhost)

> npx serverless localhost

## Overview

Goals

* 👩‍💻 Shorten AWS Lambda development feedback loops
* ⚡ Integrate with your existing serverless application
* ⛱️ Work with **all** AWS Lambda runtimes, out of the box
* 🐑 Leverage [lambci project](https://github.com/lambci/) for undifferentiated heaving lifting

## 📦 Install

Inside a serverless project directory run the following

```sh
$ npm install -D softprops/serverless-local
```

Add the following do your `serverless.yml` file

```yaml
service: demo
provider:
  name: aws
  runtime: xxx
plugins:
  # this adds informs servleress to use
  # the serverless-rust plugin
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

## 📝 Debugging

If you find your having a problem, you can run this plugin's command
with the `DEBUG` environment variable set to "localhost"

```sh
$ DEBUG=localhost npx serverless localhost
```

🚧 Planned work

* add support for binary requests and responses
* debug mod for runtimes



Doug Tangren (softprops) 2019