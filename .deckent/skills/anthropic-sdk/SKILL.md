# Anthropic SDK

## Messages API
- Always use `client.messages.create()` with explicit `model`, `max_tokens`, and `messages` parameters.
- Prefer `claude-sonnet-4-20250514` for general tasks, `claude-opus-4-20250514` for complex reasoning, `claude-haiku-235-20250325` for fast/cheap operations.
- Set `max_tokens` to a reasonable value for the expected output length. Never leave it at the default without consideration.
- Use the `system` parameter for persistent instructions. Keep system prompts concise and directive.

## Tool Use
- Define tools with `input_schema` using JSON Schema. Always include `description` for each tool and each parameter.
- Handle the `tool_use` stop reason by extracting `tool_use` content blocks, executing the tool, and returning `tool_result` in the next turn.
- Always validate tool input before execution. The model may produce malformed arguments.
- For multi-turn tool use, maintain the full conversation history including all `tool_use` and `tool_result` blocks.
- Set `tool_choice: { type: "auto" }` for flexible tool selection, `{ type: "any" }` to force tool use, or `{ type: "tool", name: "..." }` to force a specific tool.

## Streaming
- Use `client.messages.stream()` for real-time output. Listen to `text`, `content_block_start`, `content_block_delta`, and `message_stop` events.
- For tool use with streaming, accumulate `input_json_delta` events to reconstruct the full tool input JSON.
- Always handle the `stream.finalMessage()` to get the complete message object after streaming ends.
- Implement backpressure handling if the consumer is slower than the stream producer.

## Agent SDK
- Use `claude_agent_sdk` for multi-step autonomous agent workflows.
- Define tools as Python functions with docstrings (the SDK extracts schemas automatically).
- Set guardrails and max_turns to prevent runaway agent loops.
- Use handoffs for multi-agent architectures where specialized agents handle sub-tasks.

## Error Handling & Rate Limiting
- Catch `APIError` for HTTP errors, `AuthenticationError` for invalid keys, `RateLimitError` for 429 responses.
- Implement exponential backoff with jitter on `RateLimitError`. Respect `retry-after` headers when present.
- Use `APIConnectionError` handling for network failures. Distinguish transient vs permanent failures.
- Log request IDs (`response.id`) for debugging and support escalation.

## Token Management
- Use `response.usage.input_tokens` and `response.usage.output_tokens` to track consumption.
- For cost estimation, multiply token counts by per-model pricing. Cache pricing constants.
- Use prompt caching (`cache_control: { type: "ephemeral" }`) on system prompts and large tool definitions to reduce input token costs on repeated calls.

## Batch API
- Use `client.messages.batches.create()` for high-throughput, non-latency-sensitive workloads (50% cost reduction).
- Each batch request needs a unique `custom_id` for result correlation.
- Poll batch status with `client.messages.batches.retrieve()` or use webhook notifications.
- Batch results are available for 29 days after completion. Download and store results promptly.

## Best Practices
- Never hardcode API keys. Use environment variables (`ANTHROPIC_API_KEY`) or secret managers.
- Set timeouts on the client constructor: `new Anthropic({ timeout: 60_000 })`.
- Use `client.with_options()` for per-request overrides (headers, timeout) without modifying the shared client.
- Version-pin the SDK in package.json to avoid breaking changes on minor updates.
