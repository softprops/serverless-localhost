#!/bin/bash

# install it (via local link)
npm i
npm link ../.

# get help
npx serverless localhost --help

# assumes PD_API_KEY env var
npx serverless localhost start