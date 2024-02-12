# Functional Chat Demo App

## Quick start

If you need to install Node.js, follow [these instructions](https://github.com/fw-ai/forge/tree/main/apps/functional_chat#configuring-the-environment).

Install the dependencies:
```bash
npm install
```

Either edit `.env` or create a new file called `.env.local` (recommended) with api keys to the services you want to call.

Run the server in dev mode:
```bash
npm run dev
```

## Capabilities

A simple chat with function calling. Functions can perform tasks that typically involve calling external services. An LLM interprets user messages and decides which function to call and with what parameter values. The model is capable of multi-turn conversations combining the output from multiple functions, refining the calls based on additional instructions and making new calls with parameter values extracted from other function output.

## Included functions

The demo app includes the following functions (new functions are easy to add - see the next section):
- image generation with an SDXL model,
- getting stock quotes curtesy of [alphavantage](https://www.alphavantage.co/),
- charting datasets with chart.js curtesy of (quickchart)[https://quickchart.io].

## Adding a new function

TODO(pawel): add instructions after code refactoring.

## Configuring the environment

If you are starting from scratch, here are the steps to follow to set up a Node.js on your host:

1. [Install](https://github.com/nvm-sh/nvm#installing-and-updating) Node Version Manager (nvm)

2. Install the latest Node.js:
```bash
nvm install stable
```

3. Optional: to make this version your default version, run the following:
```bash
nvm alias default stable
```

4. Optional: To check what version of Node.js that you're running, run the following:
```bash
node -v
```
