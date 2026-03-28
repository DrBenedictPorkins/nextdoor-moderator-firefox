#!/bin/bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $1" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'
