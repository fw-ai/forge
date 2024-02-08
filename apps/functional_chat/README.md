# Functional Chat Demo App

## Quick start

Install the dependencies:
```
npm install
```

Either edit `.env` or create a new file called `.env.local` (recommended) with api keys to the services you want to call.

Run the server in dev mode:
```
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