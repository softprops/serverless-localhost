#!/bin/bash

# install it (via local link)
npm i
npm link ../.

# get help
npx serverless localhost --help

npx serverless localhost