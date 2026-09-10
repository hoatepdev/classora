#!/usr/bin/env node

let raw = "";

for await (const chunk of process.stdin) {
  raw += chunk;
}

const input = JSON.parse(raw || "{}");
const command = input.tool_input?.command || "";

const guarded = [
  /\bgit\s+commit\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bssh\b/i,
  /\bdocker\s+compose\s+down\b/i,
  /\bdocker\s+system\s+prune\b/i,
  /\bprisma\s+migrate\s+deploy\b/i,
  /\bprisma\s+db\s+push\b.*--force-reset/i,
  /\bcloudflared\b.*\b(delete|route)\b/i,
  /\bwrangler\b.*\bdeploy\b/i,
  /\bnpm\s+publish\b/i,
  /\bpnpm\s+publish\b/i,
];

if (guarded.some((pattern) => pattern.test(command))) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason:
          "This command has remote, destructive, deployment, or commit side effects.",
      },
    }),
  );
}
